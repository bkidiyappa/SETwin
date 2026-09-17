import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@setwin/audit";
import { NotFoundError, requirePermission, type Principal } from "@setwin/auth";
import {
  codeEdges,
  codeRepositories,
  codeSymbols,
  projects,
  withDatabase,
} from "@setwin/database";
import { gitRevParse, listSourceFiles, parseFile } from "./parse.ts";

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
): Promise<Array<{ id: string; path: string; remoteUrl: string; defaultBranch: string; lastIndexedAt: Date | null }>> {
  await requirePermission(databaseUrl, actor, "repo:view");
  return withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db.select().from(codeRepositories);
    return rows.map((row) => ({
      id: row.id,
      path: row.path,
      remoteUrl: row.remoteUrl,
      defaultBranch: row.defaultBranch,
      lastIndexedAt: row.lastIndexedAt,
    }));
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
