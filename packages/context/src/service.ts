import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NotFoundError, requirePermission, type Principal } from "@setwin/auth";
import { contextChunks, projects, withDatabase } from "@setwin/database";
import { getArtifact, listArtifacts, listRelationships } from "@setwin/twin";

/** Lightweight bag-of-words embedding (pgvector-ready float array stored as JSON). */
export function embedText(text: string, dimensions = 64): number[] {
  const vector = new Array(dimensions).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean);
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i += 1) {
      hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
    }
    const idx = hash % dimensions;
    vector[idx] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

export async function indexProjectContext(
  databaseUrl: string,
  projectKey: string,
  actor?: Principal,
): Promise<{ chunks: number }> {
  await requirePermission(databaseUrl, actor, "context:view");
  const artifacts = await listArtifacts(databaseUrl, actor, { project: projectKey });
  const project = await withDatabase(databaseUrl, async ({ db }) => {
    const row = (await db.select().from(projects).where(eq(projects.key, projectKey.trim().toLowerCase())))[0];
    if (!row) {
      throw new NotFoundError(`Project not found: ${projectKey}`);
    }
    return row;
  });
  let chunks = 0;
  await withDatabase(databaseUrl, async ({ db }) => {
    await db.delete(contextChunks).where(eq(contextChunks.projectId, project.id));
    for (const artifact of artifacts) {
      const content = `${artifact.key} ${artifact.currentVersion.title}\n${artifact.currentVersion.content}`;
      await db.insert(contextChunks).values({
        id: randomUUID(),
        projectId: project.id,
        sourceType: artifact.type,
        sourceId: artifact.key,
        content,
        embeddingJson: JSON.stringify(embedText(content)),
        metadataJson: JSON.stringify({ version: artifact.currentVersion.version }),
        createdAt: new Date(),
      });
      chunks += 1;
    }
  });
  return { chunks };
}

export async function retrieveContext(
  databaseUrl: string,
  input: { project: string; query: string; limit?: number },
  actor?: Principal,
): Promise<{
  graph: Array<{ from: string; to: string; type: string }>;
  vector: Array<{ sourceId: string; sourceType: string; score: number; content: string }>;
  teamHints: string[];
}> {
  await requirePermission(databaseUrl, actor, "context:view");
  const limit = input.limit ?? 5;
  const queryVector = embedText(input.query);
  const project = await withDatabase(databaseUrl, async ({ db }) => {
    const row = (
      await db.select().from(projects).where(eq(projects.key, input.project.trim().toLowerCase()))
    )[0];
    if (!row) {
      throw new NotFoundError(`Project not found: ${input.project}`);
    }
    return row;
  });
  const vector = await withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db.select().from(contextChunks).where(eq(contextChunks.projectId, project.id));
    return rows
      .map((row) => {
        const embedding = JSON.parse(row.embeddingJson) as number[];
        return {
          sourceId: row.sourceId,
          sourceType: row.sourceType,
          score: cosineSimilarity(queryVector, embedding),
          content: row.content.slice(0, 500),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  });

  const artifacts = await listArtifacts(databaseUrl, actor, { project: input.project });
  const graph: Array<{ from: string; to: string; type: string }> = [];
  for (const artifact of artifacts.slice(0, 20)) {
    const rels = await listRelationships(databaseUrl, artifact.key, actor);
    for (const rel of rels) {
      graph.push({ from: rel.fromKey, to: rel.toKey, type: rel.type });
    }
  }

  const teamHints: string[] = [];
  if (/security|auth|threat/i.test(input.query)) {
    teamHints.push("security_reviewer");
  }
  if (/test|qa|gherkin/i.test(input.query)) {
    teamHints.push("qa_reviewer");
  }
  if (/architect|design|api/i.test(input.query)) {
    teamHints.push("architect");
  }
  if (teamHints.length === 0) {
    teamHints.push("developer", "product_owner");
  }

  return { graph, vector, teamHints };
}

export async function getGraphNeighborhood(
  databaseUrl: string,
  key: string,
  actor?: Principal,
): Promise<Array<{ from: string; to: string; type: string }>> {
  await getArtifact(databaseUrl, key, actor);
  const rels = await listRelationships(databaseUrl, key, actor);
  return rels.map((rel) => ({ from: rel.fromKey, to: rel.toKey, type: rel.type }));
}
