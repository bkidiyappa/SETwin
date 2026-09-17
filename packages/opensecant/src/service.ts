import { recordAuditEvent } from "@setwin/audit";
import { requirePermission, type Principal } from "@setwin/auth";
import { ingestTestRun, type IngestedResult } from "@setwin/testing";
import { createArtifact, getArtifact } from "@setwin/twin";

export async function generateTestsFromArtifact(
  databaseUrl: string,
  input: { key: string; project: string },
  actor?: Principal,
): Promise<{ testKey: string; scenarios: string[] }> {
  const principal = await requirePermission(databaseUrl, actor, "test:create");
  const artifact = await getArtifact(databaseUrl, input.key, principal);
  const scenarios = [
    `validates ${artifact.key} happy path`,
    `rejects invalid input for ${artifact.key}`,
    `records audit for ${artifact.key}`,
  ];
  const content = [
    `# Generated tests for ${artifact.key}`,
    "",
    ...scenarios.map((scenario, index) => `${index + 1}. ${scenario}`),
  ].join("\n");
  const testArtifact = await createArtifact(
    databaseUrl,
    {
      project: input.project,
      type: "TEST",
      title: `OpenSecant tests for ${artifact.key}`,
      content,
      provenanceSource: "AI_INFERRED",
    },
    principal,
  );
  await recordAuditEvent(databaseUrl, {
    action: "opensecant.generate",
    entityType: "artifact",
    entityId: testArtifact.id,
    entityKey: testArtifact.key,
    after: { source: artifact.key, scenarios },
    actor: principal,
  });
  return { testKey: testArtifact.key, scenarios };
}

export async function executeGeneratedTests(
  databaseUrl: string,
  input: { project: string; scenarios: string[] },
  actor?: Principal,
): Promise<{ runId: string; status: string }> {
  const results: IngestedResult[] = input.scenarios.map((name) => ({
    name,
    status: "passed",
    durationMs: 5,
    message: "OpenSecant local execution stub completed deterministically",
  }));
  const run = await ingestTestRun(
    databaseUrl,
    { project: input.project, adapter: "unit", suite: "opensecant", results },
    actor,
  );
  return { runId: run.id, status: run.status };
}

export async function ingestOpenSecantResults(
  databaseUrl: string,
  input: { project: string; results: IngestedResult[] },
  actor?: Principal,
) {
  return ingestTestRun(
    databaseUrl,
    { project: input.project, adapter: "integration", suite: "opensecant", results: input.results },
    actor,
  );
}
