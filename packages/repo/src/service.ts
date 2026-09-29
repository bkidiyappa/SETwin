import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { recordAuditEvent } from "@setwin/audit";
import { NotFoundError, ValidationError, requirePermission, type Principal } from "@setwin/auth";
import {
  artifactVersions,
  artifacts,
  codeEdges,
  codeRepositories,
  codeSymbols,
  contextChunks,
  projects,
  withDatabase,
} from "@setwin/database";
import { gitHead, gitRevParse, listSourceFiles, parseFile, unifiedDiffForFile } from "./parse.ts";
import { isTestPath } from "./test-layout.ts";

export type ProposedFileChange = {
  path: string;
  content: string;
  action?: "add" | "modify";
};

export type AppliedChangeResult = {
  repoId: string;
  repoPath: string;
  applied: Array<{ path: string; action: "add" | "modify" }>;
  diff: string;
  summaryLines: string[];
};

export async function registerRepository(
  databaseUrl: string,
  input: { project: string; path: string },
  actor?: Principal,
): Promise<{ id: string; path: string; remoteUrl: string; defaultBranch: string }> {
  const principal = await requirePermission(databaseUrl, actor, "repo:index");
  const git = await gitRevParse(input.path);
  const row = await withDatabase(databaseUrl, async ({ db }) => {
    const project = (
      await db.select().from(projects).where(eq(projects.key, input.project.trim().toLowerCase()))
    )[0];
    if (!project) {
      throw new NotFoundError(`Project not found: ${input.project}`);
    }
    const created = {
      id: randomUUID(),
      projectId: project.id,
      path: git.root,
      remoteUrl: git.remote,
      defaultBranch: git.branch,
      lastIndexedAt: null as Date | null,
      createdAt: new Date(),
    };
    await db.insert(codeRepositories).values(created);
    return created;
  });
  await recordAuditEvent(databaseUrl, {
    action: "repo.register",
    entityType: "repository",
    entityId: row.id,
    entityKey: row.path,
    after: { remoteUrl: row.remoteUrl, branch: row.defaultBranch },
    actor: principal,
  });
  return {
    id: row.id,
    path: row.path,
    remoteUrl: row.remoteUrl,
    defaultBranch: row.defaultBranch,
  };
}

export type IndexProgress = {
  status: "running" | "done" | "error";
  filesDone: number;
  filesTotal: number;
  symbols: number;
  edges: number;
  commit: string;
  branch: string;
  message: string;
};

function symbolStillReferenced(filePath: string, name: string, kind: string, corpus: string): boolean {
  if (filePath && corpus.includes(filePath)) {
    return true;
  }
  return kind !== "file" && name.length >= 8 && corpus.includes(name);
}

const indexProgress = new Map<string, IndexProgress>();
const indexInflight = new Map<string, Promise<{ symbols: number; edges: number; files: number; commit: string }>>();

export function readIndexProgress(repositoryId: string): IndexProgress | null {
  return indexProgress.get(repositoryId) ?? null;
}

export async function indexRepository(
  databaseUrl: string,
  repositoryId: string,
  actor?: Principal,
): Promise<{ symbols: number; edges: number; files: number; commit: string }> {
  const running = indexInflight.get(repositoryId);
  if (running) {
    return running;
  }
  const job = runIndex(databaseUrl, repositoryId, actor);
  indexInflight.set(repositoryId, job);
  try {
    return await job;
  } finally {
    indexInflight.delete(repositoryId);
  }
}

async function runIndex(
  databaseUrl: string,
  repositoryId: string,
  actor?: Principal,
): Promise<{ symbols: number; edges: number; files: number; commit: string }> {
  const principal = await requirePermission(databaseUrl, actor, "repo:index");
  const repo = await withDatabase(databaseUrl, async ({ db }) => {
    const row = (await db.select().from(codeRepositories).where(eq(codeRepositories.id, repositoryId)))[0];
    if (!row) {
      throw new NotFoundError(`Repository not found: ${repositoryId}`);
    }
    return row;
  });
  const head = await gitHead(repo.path);
  const files = await listSourceFiles(repo.path);
  const publish = (patch: Partial<IndexProgress>) => {
    const current = indexProgress.get(repositoryId);
    indexProgress.set(repositoryId, {
      status: "running",
      filesDone: 0,
      filesTotal: files.length,
      symbols: 0,
      edges: 0,
      commit: head.commit,
      branch: head.branch,
      message: "Reading the repository",
      ...current,
      ...patch,
    });
  };
  publish({ status: "running", filesDone: 0, message: "Reading source files" });
  type Desired = {
    key: string;
    filePath: string;
    language: string;
    kind: string;
    name: string;
    startLine: number;
    endLine: number;
    signature: string;
  };
  const desired: Desired[] = [];
  const parsedEdges: Array<{ fromKey: string; toKey: string; edgeType: string }> = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]!;
      const relative = file.slice(repo.path.length).replaceAll("\\", "/").replace(/^\//, "");
      const parsed = await parseFile(file, repo.path);
      if (!parsed.symbols.length) {
        const language = relative.split(".").pop() ?? "file";
        parsed.symbols.push({
          filePath: relative,
          language,
          kind: "file",
          name: relative,
          startLine: 1,
          endLine: 1,
          signature: relative,
        });
      }
      const seenSymbols = new Set<string>();
      for (const symbol of parsed.symbols) {
        const key = `${symbol.filePath}\0${symbol.name}`;
        if (seenSymbols.has(key)) {
          continue;
        }
        seenSymbols.add(key);
        desired.push({
          key,
          filePath: symbol.filePath,
          language: symbol.language,
          kind: symbol.kind,
          name: symbol.name,
          startLine: symbol.startLine,
          endLine: symbol.endLine,
          signature: symbol.signature,
        });
      }
      for (const edge of parsed.edges) {
        parsedEdges.push({
          fromKey: `${edge.filePath}::${edge.fromName}`,
          toKey: `${edge.filePath}::${edge.toName}`,
          edgeType: edge.edgeType,
        });
      }
      if (index % 25 === 0 || index === files.length - 1) {
        publish({ filesDone: index + 1, symbols: desired.length, message: `Read ${index + 1} of ${files.length} files` });
      }
    }
    publish({ filesDone: files.length, symbols: desired.length, message: "Saving the code graph" });
    const counts = await withDatabase(databaseUrl, async ({ db }) => {
      const existing = await db.select().from(codeSymbols).where(eq(codeSymbols.repositoryId, repo.id));
      const existingByKey = new Map(existing.map((row) => [`${row.filePath}\0${row.name}`, row]));
      const bodies = await db
        .select({ content: artifactVersions.content })
        .from(artifacts)
        .innerJoin(artifactVersions, eq(artifactVersions.id, artifacts.currentVersionId))
        .where(and(eq(artifacts.projectId, repo.projectId), isNull(artifacts.deletedAt)));
      const corpus = bodies.map((row) => row.content).join("\n");
      const idByKey = new Map<string, string>();
      const liveIds = new Set<string>();
      const inserts: Array<typeof codeSymbols.$inferInsert> = [];
      for (const symbol of desired) {
        const prior = existingByKey.get(symbol.key);
        if (prior) {
          liveIds.add(prior.id);
          idByKey.set(`${symbol.filePath}::${symbol.name}`, prior.id);
          if (!idByKey.has(symbol.name)) {
            idByKey.set(symbol.name, prior.id);
          }
          await db
            .update(codeSymbols)
            .set({
              language: symbol.language,
              kind: symbol.kind,
              startLine: symbol.startLine,
              endLine: symbol.endLine,
              signature: symbol.signature,
            })
            .where(eq(codeSymbols.id, prior.id));
        } else {
          const id = randomUUID();
          liveIds.add(id);
          idByKey.set(`${symbol.filePath}::${symbol.name}`, id);
          if (!idByKey.has(symbol.name)) {
            idByKey.set(symbol.name, id);
          }
          inserts.push({
            id,
            repositoryId: repo.id,
            filePath: symbol.filePath,
            language: symbol.language,
            kind: symbol.kind,
            name: symbol.name,
            startLine: symbol.startLine,
            endLine: symbol.endLine,
            signature: symbol.signature,
          });
        }
      }
      for (let offset = 0; offset < inserts.length; offset += 100) {
        await db.insert(codeSymbols).values(inserts.slice(offset, offset + 100));
      }
      const dropIds = existing
        .filter((row) => !liveIds.has(row.id) && !symbolStillReferenced(row.filePath, row.name, row.kind, corpus))
        .map((row) => row.id);
      if (dropIds.length) {
        await db.delete(codeEdges).where(and(eq(codeEdges.repositoryId, repo.id), inArray(codeEdges.fromSymbolId, dropIds)));
        await db.delete(codeEdges).where(and(eq(codeEdges.repositoryId, repo.id), inArray(codeEdges.toSymbolId, dropIds)));
        await db
          .delete(contextChunks)
          .where(and(eq(contextChunks.projectId, repo.projectId), eq(contextChunks.sourceType, "code_symbol"), inArray(contextChunks.sourceId, dropIds)));
        await db.delete(codeSymbols).where(inArray(codeSymbols.id, dropIds));
      }
      const refreshedIds = [...liveIds];
      if (refreshedIds.length) {
        await db.delete(codeEdges).where(and(eq(codeEdges.repositoryId, repo.id), inArray(codeEdges.fromSymbolId, refreshedIds)));
      }
      const edgeRows: Array<typeof codeEdges.$inferInsert> = [];
      const seenEdges = new Set<string>();
      for (const edge of parsedEdges) {
        const toName = edge.toKey.includes("::") ? edge.toKey.slice(edge.toKey.indexOf("::") + 2) : edge.toKey;
        const fromId = idByKey.get(edge.fromKey);
        const toId = idByKey.get(edge.toKey) ?? idByKey.get(toName);
        if (!fromId || !toId || fromId === toId) {
          continue;
        }
        const edgeKey = `${fromId}|${toId}|${edge.edgeType}`;
        if (seenEdges.has(edgeKey)) {
          continue;
        }
        seenEdges.add(edgeKey);
        edgeRows.push({
          id: randomUUID(),
          repositoryId: repo.id,
          fromSymbolId: fromId,
          toSymbolId: toId,
          edgeType: edge.edgeType,
        });
      }
      for (let offset = 0; offset < edgeRows.length; offset += 100) {
        await db.insert(codeEdges).values(edgeRows.slice(offset, offset + 100));
      }
      const now = new Date();
      const chunkRows = desired.map((symbol) => {
        const sourceId = idByKey.get(`${symbol.filePath}::${symbol.name}`)!;
        return {
          id: randomUUID(),
          projectId: repo.projectId,
          sourceType: "code_symbol",
          sourceId,
          content: `${symbol.filePath}\n${symbol.name}\n${symbol.signature}\n${symbol.startLine}-${symbol.endLine}`,
          embeddingJson: "[]",
          metadataJson: JSON.stringify({ filePath: symbol.filePath, name: symbol.name, kind: symbol.kind }),
          createdAt: now,
        };
      });
      const sourceIds = chunkRows.map((row) => row.sourceId);
      if (sourceIds.length) {
        await db
          .delete(contextChunks)
          .where(and(eq(contextChunks.projectId, repo.projectId), eq(contextChunks.sourceType, "code_symbol"), inArray(contextChunks.sourceId, sourceIds)));
        for (let offset = 0; offset < chunkRows.length; offset += 100) {
          await db.insert(contextChunks).values(chunkRows.slice(offset, offset + 100));
        }
      }
      await db
        .update(codeRepositories)
        .set({ lastIndexedAt: now, indexedCommit: head.commit, indexedBranch: head.branch })
        .where(eq(codeRepositories.id, repo.id));
      return { symbols: liveIds.size, edges: edgeRows.length };
    });
    publish({
      status: "done",
      filesDone: files.length,
      symbols: counts.symbols,
      edges: counts.edges,
      message: `Indexed ${counts.symbols} symbols`,
    });
    await recordAuditEvent(databaseUrl, {
      action: "repo.index",
      entityType: "repository",
      entityId: repo.id,
      entityKey: repo.path,
      after: { symbols: counts.symbols, edges: counts.edges, files: files.length, commit: head.commit },
      actor: principal,
    });
    return { symbols: counts.symbols, edges: counts.edges, files: files.length, commit: head.commit };
  } catch (error) {
    publish({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function listRepositories(
  databaseUrl: string,
  actor?: Principal,
  filter?: { project?: string },
): Promise<
  Array<{ id: string; path: string; remoteUrl: string; defaultBranch: string; lastIndexedAt: Date | null; indexedCommit: string; indexedBranch: string; projectKey?: string }>
> {
  await requirePermission(databaseUrl, actor, "repo:view");
  return withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db.select().from(codeRepositories);
    const projectRows = await db.select().from(projects);
    const projectById = new Map(projectRows.map((row) => [row.id, row.key]));
    const wanted = filter?.project?.trim().toLowerCase();
    return rows
      .map((row) => ({
        id: row.id,
        path: row.path,
        remoteUrl: row.remoteUrl,
        defaultBranch: row.defaultBranch,
        lastIndexedAt: row.lastIndexedAt,
        indexedCommit: row.indexedCommit ?? "",
        indexedBranch: row.indexedBranch ?? "",
        projectKey: projectById.get(row.projectId),
      }))
      .filter((row) => !wanted || row.projectKey === wanted);
  });
}

export async function listSymbols(
  databaseUrl: string,
  repositoryId: string,
  actor?: Principal,
): Promise<Array<{ id: string; filePath: string; language: string; kind: string; name: string }>> {
  await requirePermission(databaseUrl, actor, "repo:view");
  return withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db.select().from(codeSymbols).where(eq(codeSymbols.repositoryId, repositoryId));
    return rows.map((row) => ({
      id: row.id,
      filePath: row.filePath,
      language: row.language,
      kind: row.kind,
      name: row.name,
    }));
  });
}

export async function recallCodeNeighborhood(
  databaseUrl: string,
  input: { project: string; filePaths: string[] },
  actor?: Principal,
): Promise<{ neighborFiles: string[]; chunks: string[] }> {
  await requirePermission(databaseUrl, actor, "repo:view");
  const wanted = [...new Set(input.filePaths.map((file) => file.replaceAll("\\", "/").replace(/^\.?\//, "")).filter(Boolean))];
  if (!wanted.length) {
    return { neighborFiles: [], chunks: [] };
  }
  return withDatabase(databaseUrl, async ({ db }) => {
    const project = (await db.select().from(projects).where(eq(projects.key, input.project.trim().toLowerCase())))[0];
    if (!project) {
      return { neighborFiles: [], chunks: [] };
    }
    const repos = await db.select().from(codeRepositories).where(eq(codeRepositories.projectId, project.id));
    if (!repos.length) {
      return { neighborFiles: [], chunks: [] };
    }
    const symbols = await db
      .select()
      .from(codeSymbols)
      .where(and(inArray(codeSymbols.repositoryId, repos.map((row) => row.id)), inArray(codeSymbols.filePath, wanted)));
    if (!symbols.length) {
      return { neighborFiles: [], chunks: [] };
    }
    const touched = new Set(symbols.map((row) => row.id));
    const touchedIds = [...touched];
    const edges = await db
      .select()
      .from(codeEdges)
      .where(or(inArray(codeEdges.fromSymbolId, touchedIds), inArray(codeEdges.toSymbolId, touchedIds)));
    const neighborIds = new Set<string>();
    for (const edge of edges) {
      if (touched.has(edge.fromSymbolId)) {
        neighborIds.add(edge.toSymbolId);
      }
      if (touched.has(edge.toSymbolId)) {
        neighborIds.add(edge.fromSymbolId);
      }
    }
    const allIds = [...new Set([...touched, ...neighborIds])];
    const related = allIds.length
      ? await db.select().from(codeSymbols).where(inArray(codeSymbols.id, allIds))
      : [];
    const wantedSet = new Set(wanted);
    const neighborFiles = [...new Set(related.map((row) => row.filePath).filter((file) => !wantedSet.has(file)))];
    const stored = await db
      .select()
      .from(contextChunks)
      .where(and(eq(contextChunks.projectId, project.id), eq(contextChunks.sourceType, "code_symbol"), inArray(contextChunks.sourceId, [...touched])));
    const bySource = new Map(stored.map((row) => [row.sourceId, row.content]));
    const chunks = symbols.slice(0, 40).map((row) => bySource.get(row.id) ?? `${row.filePath}\n${row.name}\n${row.signature}\n${row.startLine}-${row.endLine}`);
    return { neighborFiles, chunks };
  });
}

function safeRelativePath(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+/, "").trim();
  if (!normalized || normalized.includes("..") || path.isAbsolute(normalized)) {
    throw new ValidationError(`Unsafe file path: ${relativePath}`);
  }
  return normalized;
}

/**
 * Write proposed files under a registered repository and return a unified diff of the changes.
 * Changes remain in the working tree (not committed) for human review.
 */
export async function applyProposedChanges(
  databaseUrl: string,
  input: { project: string; repositoryId?: string; files: ProposedFileChange[]; summary?: string },
  actor?: Principal,
): Promise<AppliedChangeResult> {
  const principal = await requirePermission(databaseUrl, actor, "artifact:create");
  const repos = await listRepositories(databaseUrl, principal, { project: input.project });
  if (!repos.length) {
    throw new ValidationError(
      `No repository registered for project ${input.project}. Register one on Setup before generating code.`,
    );
  }
  const repo = input.repositoryId
    ? repos.find((row) => row.id === input.repositoryId)
    : repos[0];
  if (!repo) {
    throw new NotFoundError(`Repository not found for project ${input.project}`);
  }
  if (!input.files.length) {
    throw new ValidationError("At least one file change is required");
  }

  const applied: Array<{ path: string; action: "add" | "modify" }> = [];
  const diffs: string[] = [];

  for (const file of input.files) {
    const relative = safeRelativePath(file.path);
    const absolute = path.join(repo.path, relative);
    // Ensure we stay inside repo root
    if (!absolute.replaceAll("\\", "/").startsWith(repo.path.replaceAll("\\", "/"))) {
      throw new ValidationError(`Path escapes repository root: ${file.path}`);
    }
    let before: string | null = null;
    try {
      before = await readFile(absolute, "utf8");
    } catch {
      before = null;
    }
    const action: "add" | "modify" = before == null ? "add" : "modify";
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, file.content, "utf8");
    applied.push({ path: relative, action });
    diffs.push(unifiedDiffForFile(relative, before, file.content));
  }

  const summaryLines = [
    input.summary?.trim() || `Applied ${applied.length} file change(s) to ${repo.path}`,
    ...applied.map((row) => `${row.action}: ${row.path}`),
  ];

  await recordAuditEvent(databaseUrl, {
    action: "repo.apply_changes",
    entityType: "repository",
    entityId: repo.id,
    entityKey: repo.path,
    after: { files: applied, summary: input.summary ?? "" },
    actor: principal,
  });

  return {
    repoId: repo.id,
    repoPath: repo.path,
    applied,
    diff: diffs.join("\n\n"),
    summaryLines,
  };
}

export type RepoFileSnapshot = {
  path: string;
  excerpt: string;
  isTest: boolean;
};

/** List source/test files under a registered repo with short excerpts for LLM context. */
export async function snapshotRepositoryFiles(
  databaseUrl: string,
  input: { project: string; repositoryId?: string; limit?: number },
  actor?: Principal,
): Promise<{ repoId: string; repoPath: string; files: RepoFileSnapshot[] }> {
  await requirePermission(databaseUrl, actor, "repo:view");
  const repos = await listRepositories(databaseUrl, actor, { project: input.project });
  const repo = input.repositoryId ? repos.find((row) => row.id === input.repositoryId) : repos[0];
  if (!repo) {
    throw new NotFoundError(`Repository not found for project ${input.project}`);
  }
  const limit = input.limit ?? 40;
  const absoluteFiles = await listSourceFiles(repo.path, 300);
  const ranked = absoluteFiles
    .map((full) => {
      const relative = path.relative(repo.path, full).replaceAll("\\", "/");
      const isTest = isTestPath(relative);
      return { full, relative, isTest };
    })
    .sort((a, b) => Number(b.isTest) - Number(a.isTest) || a.relative.localeCompare(b.relative))
    .slice(0, limit);

  const files: RepoFileSnapshot[] = [];
  for (const row of ranked) {
    try {
      const raw = await readFile(row.full, "utf8");
      files.push({
        path: row.relative,
        isTest: row.isTest,
        excerpt: raw.length > 1200 ? `${raw.slice(0, 1200)}\n/* …truncated… */` : raw,
      });
    } catch {
      // skip unreadable
    }
  }
  return { repoId: repo.id, repoPath: repo.path, files };
}
