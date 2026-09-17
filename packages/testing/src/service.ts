import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@setwin/audit";
import { NotFoundError, ValidationError, requirePermission, type Principal } from "@setwin/auth";
import { projects, testResults, testRuns, withDatabase } from "@setwin/database";

export const TEST_ADAPTERS = ["playwright", "api", "unit", "integration", "selenium", "cypress"] as const;
export type TestAdapterName = (typeof TEST_ADAPTERS)[number];

export type IngestedResult = { name: string; status: "passed" | "failed" | "skipped"; durationMs?: number; message?: string };

export async function ingestTestRun(
  databaseUrl: string,
  input: {
    project: string;
    adapter: string;
    suite?: string;
    results: IngestedResult[];
  },
  actor?: Principal,
): Promise<{ id: string; status: string; passed: number; failed: number; skipped: number }> {
  const principal = await requirePermission(databaseUrl, actor, "test:run");
  const adapter = input.adapter.trim().toLowerCase() as TestAdapterName;
  if (!TEST_ADAPTERS.includes(adapter)) {
    throw new ValidationError(`Unknown test adapter: ${input.adapter}`);
  }
  const passed = input.results.filter((row) => row.status === "passed").length;
  const failed = input.results.filter((row) => row.status === "failed").length;
  const skipped = input.results.filter((row) => row.status === "skipped").length;
  const status = failed > 0 ? "failed" : "passed";
  const project = await withDatabase(databaseUrl, async ({ db }) => {
    const row = (await db.select().from(projects).where(eq(projects.key, input.project.trim().toLowerCase())))[0];
    if (!row) {
      throw new NotFoundError(`Project not found: ${input.project}`);
    }
    return row;
  });
  const runId = randomUUID();
  const now = new Date();
  await withDatabase(databaseUrl, async ({ db }) => {
    await db.insert(testRuns).values({
      id: runId,
      projectId: project.id,
      adapter,
      suite: input.suite ?? "",
      status,
      summaryJson: JSON.stringify({ passed, failed, skipped }),
      startedAt: now,
      finishedAt: now,
      createdBy: principal.id,
    });
    for (const result of input.results) {
      await db.insert(testResults).values({
        id: randomUUID(),
        runId,
        name: result.name,
        status: result.status,
        durationMs: result.durationMs ?? 0,
        message: result.message ?? "",
      });
    }
  });
  await recordAuditEvent(databaseUrl, {
    action: "testing.ingest",
    entityType: "test_run",
    entityId: runId,
    entityKey: `${adapter}:${input.suite ?? "default"}`,
    after: { status, passed, failed, skipped },
    actor: principal,
  });
  return { id: runId, status, passed, failed, skipped };
}

export async function listTestRuns(
  databaseUrl: string,
  actor?: Principal,
): Promise<Array<{ id: string; adapter: string; suite: string; status: string; summary: Record<string, number> }>> {
  await requirePermission(databaseUrl, actor, "test:run");
  return withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db.select().from(testRuns);
    return rows.map((row) => ({
      id: row.id,
      adapter: row.adapter,
      suite: row.suite,
      status: row.status,
      summary: JSON.parse(row.summaryJson) as Record<string, number>,
    }));
  });
}

export function parseJunitLike(xml: string): IngestedResult[] {
  const results: IngestedResult[] = [];
  const openTag = /<testcase\b([^>]*?)(\/>|>)/gi;
  let match: RegExpExecArray | null;
  while ((match = openTag.exec(xml)) !== null) {
    const attrs = match[1] ?? "";
    const closer = match[2];
    let body = "";
    if (closer === ">") {
      const start = openTag.lastIndex;
      const end = xml.toLowerCase().indexOf("</testcase>", start);
      if (end === -1) {
        continue;
      }
      body = xml.slice(start, end);
      openTag.lastIndex = end + "</testcase>".length;
    }
    const name = /name="([^"]+)"/.exec(attrs)?.[1] ?? "unnamed";
    const time = Number(/time="([^"]+)"/.exec(attrs)?.[1] ?? "0");
    let status: IngestedResult["status"] = "passed";
    let message = "";
    if (/<failure\b/i.test(body) || /<error\b/i.test(body)) {
      status = "failed";
      message = body.replace(/<[^>]+>/g, " ").trim().slice(0, 500);
    } else if (/<skipped\b/i.test(body)) {
      status = "skipped";
    }
    results.push({ name, status, durationMs: Math.round(time * 1000), message });
  }
  return results;
}
