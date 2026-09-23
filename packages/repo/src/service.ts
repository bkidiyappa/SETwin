import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@setwin/audit";
import { NotFoundError, ValidationError, requirePermission, type Principal } from "@setwin/auth";
import {
  codeEdges,
  codeRepositories,
  codeSymbols,
  projects,
  withDatabase,
} from "@setwin/database";
import { gitRevParse, listSourceFiles, parseFile, unifiedDiffForFile } from "./parse.ts";
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

export async function indexRepository(
  databaseUrl: string,
  repositoryId: string,
  actor?: Principal,
): Promise<{ symbols: number; edges: number }> {
  const principal = await requirePermission(databaseUrl, actor, "repo:index");
  const repo = await withDatabase(databaseUrl, async ({ db }) => {
    const row = (await db.select().from(codeRepositories).where(eq(codeRepositories.id, repositoryId)))[0];
    if (!row) {
      throw new NotFoundError(`Repository not found: ${repositoryId}`);
    }
    return row;
  });
  const files = await listSourceFiles(repo.path);
  let symbolCount = 0;
  let edgeCount = 0;
  await withDatabase(databaseUrl, async ({ db }) => {
    await db.delete(codeEdges).where(eq(codeEdges.repositoryId, repo.id));
    await db.delete(codeSymbols).where(eq(codeSymbols.repositoryId, repo.id));
    const symbolIds = new Map<string, string>();
    for (const file of files) {
      const parsed = await parseFile(file, repo.path);
      for (const symbol of parsed.symbols) {
        const id = randomUUID();
        symbolIds.set(`${symbol.filePath}::${symbol.name}`, id);
        await db.insert(codeSymbols).values({
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
        symbolCount += 1;
      }
      for (const edge of parsed.edges) {
        const fromId = symbolIds.get(`${edge.filePath}::${edge.fromName}`) ?? symbolIds.get(edge.fromName);
        const toId = symbolIds.get(`${edge.filePath}::${edge.toName}`) ?? symbolIds.get(edge.toName);
        if (!fromId || !toId) {
          continue;
        }
        await db.insert(codeEdges).values({
          id: randomUUID(),
          repositoryId: repo.id,
          fromSymbolId: fromId,
          toSymbolId: toId,
          edgeType: edge.edgeType,
        });
        edgeCount += 1;
      }
    }
    await db
      .update(codeRepositories)
      .set({ lastIndexedAt: new Date() })
      .where(eq(codeRepositories.id, repo.id));
  });
  await recordAuditEvent(databaseUrl, {
    action: "repo.index",
    entityType: "repository",
    entityId: repo.id,
    entityKey: repo.path,
    after: { symbols: symbolCount, edges: edgeCount },
    actor: principal,
  });
  return { symbols: symbolCount, edges: edgeCount };
}

export async function listRepositories(
  databaseUrl: string,
  actor?: Principal,
  filter?: { project?: string },
): Promise<
  Array<{ id: string; path: string; remoteUrl: string; defaultBranch: string; lastIndexedAt: Date | null; projectKey?: string }>
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
