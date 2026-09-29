import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { recordAuditEvent } from "@setwin/audit";
import { ConflictError, NotFoundError, ValidationError, requirePermission, type Principal } from "@setwin/auth";
import { testAutomationLinks, testPlanRevisions, testPlans, withDatabase } from "@setwin/database";
import { applyProposedChanges, listRepositories } from "@setwin/repo";
import { ingestTestRun, type IngestedResult } from "@setwin/testing";
import { createArtifact, getArtifact, getTestPlan } from "@setwin/twin";
import { openSecantFile, openSecantSlug, safeScriptPath } from "./script.ts";

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
  input: { project: string; scenarios?: string[]; scriptPath?: string },
  actor?: Principal,
): Promise<{ runId: string; status: string }> {
  if (input.scriptPath?.trim()) {
    const run = await runOpenSecantScript(databaseUrl, input.project, input.scriptPath, actor);
    return { runId: run.runId, status: run.status };
  }
  throw new ValidationError("scriptPath is required. Automate a test on the master plan, then run that script.");
}

export async function automateTestPlanItem(databaseUrl: string, planId: string, key: string, actor?: Principal) {
  const principal = await requirePermission(databaseUrl, actor, "artifact:create");
  const loaded = await requireMasterPlan(databaseUrl, planId, principal);
  const item = loaded.items.find((row) => row.key.toUpperCase() === key.trim().toUpperCase());
  if (!item) {
    throw new NotFoundError(`Test not on this plan: ${key}`);
  }
  const artifact = await getArtifact(databaseUrl, item.key, principal);
  const repos = await listRepositories(databaseUrl, principal, { project: loaded.projectKey });
  const repo = repos[0];
  if (!repo) {
    throw new ValidationError("Register a product repository before automating a test.");
  }
  const slug = openSecantSlug(item.title, item.key);
  let relative = `tests/smoke/${slug}.test`;
  if (await fileExists(path.join(repo.path, relative))) {
    relative = `tests/smoke/${slug}-${item.key.toLowerCase()}.test`;
  }
  const content = openSecantFile(item.title, artifact.currentVersion.content);
  await applyProposedChanges(databaseUrl, { project: loaded.projectKey, repositoryId: repo.id, files: [{ path: relative, content }] }, principal);
  await saveLink(databaseUrl, planId, loaded.projectId, item.key, relative, principal.id, `Automated ${item.key} with ${relative}`);
  return getTestPlan(databaseUrl, planId, principal);
}

export async function setTestAutomationLink(
  databaseUrl: string,
  planId: string,
  key: string,
  scriptPath: string,
  actor?: Principal,
) {
  const principal = await requirePermission(databaseUrl, actor, "artifact:create");
  const loaded = await requireMasterPlan(databaseUrl, planId, principal);
  const item = loaded.items.find((row) => row.key.toUpperCase() === key.trim().toUpperCase());
  if (!item) {
    throw new NotFoundError(`Test not on this plan: ${key}`);
  }
  const next = scriptPath.trim();
  if (!next) {
    await withDatabase(databaseUrl, async ({ db }) => {
      await db
        .delete(testAutomationLinks)
        .where(and(eq(testAutomationLinks.projectId, loaded.projectId), eq(testAutomationLinks.artifactKey, item.key)));
      await db.insert(testPlanRevisions).values({
        id: randomUUID(),
        planId,
        actorId: principal.id,
        summary: `Cleared automation for ${item.key}`,
        createdAt: new Date(),
      });
    });
    return getTestPlan(databaseUrl, planId, principal);
  }
  const relative = safeScriptPath(next);
  const repos = await listRepositories(databaseUrl, principal, { project: loaded.projectKey });
  const repo = repos[0];
  if (!repo) {
    throw new ValidationError("Register a product repository before linking a script.");
  }
  const absolute = path.resolve(repo.path, relative);
  if (!absolute.replaceAll("\\", "/").startsWith(repo.path.replaceAll("\\", "/"))) {
    throw new ValidationError("Script path escapes the product repository");
  }
  if (!(await fileExists(absolute))) {
    throw new NotFoundError(`OpenSecant script not found: ${relative}`);
  }
  await saveLink(databaseUrl, planId, loaded.projectId, item.key, relative, principal.id, `Linked ${item.key} to ${relative}`);
  return getTestPlan(databaseUrl, planId, principal);
}

export async function runTestPlanScript(databaseUrl: string, planId: string, scriptPath: string, actor?: Principal) {
  const principal = await requirePermission(databaseUrl, actor, "test:run");
  const loaded = await requireMasterPlan(databaseUrl, planId, principal);
  const relative = safeScriptPath(scriptPath);
  const linked = loaded.items.some((row) => row.scriptPath === relative);
  if (!linked) {
    throw new NotFoundError(`No test on this plan uses ${relative}`);
  }
  const outcome = await runOpenSecantScript(databaseUrl, loaded.projectKey, relative, principal);
  const plan = await getTestPlan(databaseUrl, planId, principal);
  return { ...plan, runId: outcome.runId, runStatus: outcome.status };
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

async function requireMasterPlan(databaseUrl: string, planId: string, actor: Principal) {
  const plan = await getTestPlan(databaseUrl, planId, actor);
  if (plan.kind !== "MASTER") {
    throw new ConflictError("Automation links are edited on the master test plan");
  }
  if (plan.status !== "ACTIVE") {
    throw new ConflictError("A released test plan is locked");
  }
  const row = await withDatabase(databaseUrl, async ({ db }) => {
    return (await db.select().from(testPlans).where(eq(testPlans.id, planId)))[0];
  });
  if (!row) {
    throw new NotFoundError("Test plan not found");
  }
  return { ...plan, projectId: row.projectId };
}

async function saveLink(
  databaseUrl: string,
  planId: string,
  projectId: string,
  artifactKey: string,
  scriptPath: string,
  actorId: string,
  summary: string,
) {
  await withDatabase(databaseUrl, async ({ db }) => {
    const existing = (
      await db
        .select()
        .from(testAutomationLinks)
        .where(and(eq(testAutomationLinks.projectId, projectId), eq(testAutomationLinks.artifactKey, artifactKey)))
    )[0];
    if (existing) {
      await db.update(testAutomationLinks).set({ scriptPath }).where(eq(testAutomationLinks.id, existing.id));
    } else {
      await db.insert(testAutomationLinks).values({
        id: randomUUID(),
        projectId,
        artifactKey,
        scriptPath,
      });
    }
    await db.insert(testPlanRevisions).values({
      id: randomUUID(),
      planId,
      actorId,
      summary,
      createdAt: new Date(),
    });
  });
}

async function fileExists(absolute: string): Promise<boolean> {
  try {
    await access(absolute);
    return true;
  } catch {
    return false;
  }
}

async function runOpenSecantScript(databaseUrl: string, project: string, scriptPath: string, actor?: Principal) {
  const principal = await requirePermission(databaseUrl, actor, "test:run");
  const relative = safeScriptPath(scriptPath);
  const repos = await listRepositories(databaseUrl, principal, { project });
  const repo = repos[0];
  if (!repo) {
    throw new ValidationError("Register a product repository before running OpenSecant.");
  }
  const output = await spawnOpenSecant(repo.path, relative.replace(/^tests\//, ""));
  const status = output.code === 0 ? "passed" : "failed";
  const run = await ingestTestRun(
    databaseUrl,
    {
      project,
      adapter: "playwright",
      suite: "opensecant",
      results: [{ name: relative, status, durationMs: output.durationMs, message: output.tail }],
    },
    principal,
  );
  return { runId: run.id, status: run.status };
}

function spawnOpenSecant(cwd: string, arg: string): Promise<{ code: number; tail: string; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn("npx", ["opensecant", arg], {
      cwd,
      shell: process.platform === "win32",
      env: { ...process.env, OPENSECANT_SKIP_INTERACTIVE_PAUSE: "true" },
    });
    let text = "";
    const take = (chunk: Buffer) => {
      text = `${text}${chunk.toString()}`.slice(-4000);
    };
    child.stdout?.on("data", take);
    child.stderr?.on("data", take);
    const timer = setTimeout(() => {
      child.kill();
      reject(new ValidationError("OpenSecant timed out after 8 minutes."));
    }, 8 * 60 * 1000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new ValidationError(`OpenSecant did not start. Install it in the product repo. ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, tail: text.trim().slice(-500), durationMs: Date.now() - started });
    });
  });
}
