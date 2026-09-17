import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@setwin/audit";
import { NotFoundError, requirePermission, type Principal } from "@setwin/auth";
import { changeAnalyses, codeRepositories, codeSymbols, withDatabase } from "@setwin/database";
import { gitDiff, gitDiffNameOnly } from "@setwin/repo";

export type ChangeAnalysis = {
  id: string;
  repositoryId: string;
  baseRef: string;
  headRef: string;
  diffSummary: string;
  impactedSymbols: string[];
  regressionScope: string[];
  riskScore: number;
  riskLevel: string;
  createdAt: Date;
};

export function scoreRisk(input: {
  changedFiles: number;
  impactedSymbols: number;
  languages: string[];
}): { riskScore: number; riskLevel: string } {
  let score = Math.min(100, input.changedFiles * 4 + input.impactedSymbols * 3);
  if (input.languages.includes("typescript") || input.languages.includes("javascript")) {
    score += 5;
  }
  if (input.changedFiles > 20) {
    score += 15;
  }
  const riskLevel = score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
  return { riskScore: score, riskLevel };
}

export async function analyzeChange(
  databaseUrl: string,
  input: { repositoryId: string; baseRef: string; headRef: string },
  actor?: Principal,
): Promise<ChangeAnalysis> {
  const principal = await requirePermission(databaseUrl, actor, "change:analyze");
  const repo = await withDatabase(databaseUrl, async ({ db }) => {
    const row = (
      await db.select().from(codeRepositories).where(eq(codeRepositories.id, input.repositoryId))
    )[0];
    if (!row) {
      throw new NotFoundError(`Repository not found: ${input.repositoryId}`);
    }
    return row;
  });
  const diffSummary = await gitDiff(repo.path, input.baseRef, input.headRef);
  const changedFiles = await gitDiffNameOnly(repo.path, input.baseRef, input.headRef);
  const symbols = await withDatabase(databaseUrl, async ({ db }) => {
    return db.select().from(codeSymbols).where(eq(codeSymbols.repositoryId, repo.id));
  });
  const impacted = symbols
    .filter((symbol) => changedFiles.some((file) => file.replaceAll("\\", "/") === symbol.filePath || file.endsWith(symbol.filePath)))
    .map((symbol) => symbol.name);
  const uniqueImpacted = [...new Set(impacted)];
  const regressionScope = [...new Set(changedFiles.map((file) => file.split("/")[0] || file))];
  const { riskScore, riskLevel } = scoreRisk({
    changedFiles: changedFiles.length,
    impactedSymbols: uniqueImpacted.length,
    languages: [...new Set(symbols.map((row) => row.language))],
  });
  const created = await withDatabase(databaseUrl, async ({ db }) => {
    const row = {
      id: randomUUID(),
      repositoryId: repo.id,
      baseRef: input.baseRef,
      headRef: input.headRef,
      diffSummary,
      impactedSymbols: JSON.stringify(uniqueImpacted),
      regressionScope: JSON.stringify(regressionScope),
      riskScore,
      riskLevel,
      createdBy: principal.id,
      createdAt: new Date(),
    };
    await db.insert(changeAnalyses).values(row);
    return row;
  });
  await recordAuditEvent(databaseUrl, {
    action: "change.analyze",
    entityType: "change_analysis",
    entityId: created.id,
    entityKey: `${input.baseRef}...${input.headRef}`,
    after: { riskScore, riskLevel, files: changedFiles.length },
    actor: principal,
  });
  return {
    id: created.id,
    repositoryId: created.repositoryId,
    baseRef: created.baseRef,
    headRef: created.headRef,
    diffSummary: created.diffSummary,
    impactedSymbols: uniqueImpacted,
    regressionScope,
    riskScore,
    riskLevel,
    createdAt: created.createdAt,
  };
}

export async function getChangeAnalysis(
  databaseUrl: string,
  id: string,
  actor?: Principal,
): Promise<ChangeAnalysis> {
  await requirePermission(databaseUrl, actor, "change:analyze");
  return withDatabase(databaseUrl, async ({ db }) => {
    const row = (await db.select().from(changeAnalyses).where(eq(changeAnalyses.id, id)))[0];
    if (!row) {
      throw new NotFoundError(`Change analysis not found: ${id}`);
    }
    return {
      id: row.id,
      repositoryId: row.repositoryId,
      baseRef: row.baseRef,
      headRef: row.headRef,
      diffSummary: row.diffSummary,
      impactedSymbols: JSON.parse(row.impactedSymbols) as string[],
      regressionScope: JSON.parse(row.regressionScope) as string[],
      riskScore: row.riskScore,
      riskLevel: row.riskLevel,
      createdAt: row.createdAt,
    };
  });
}
