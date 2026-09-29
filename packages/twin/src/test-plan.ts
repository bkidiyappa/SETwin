import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  requirePermission,
  type Principal,
} from "@setwin/auth";
import {
  artifactVersions,
  artifacts,
  projects,
  testPlanChanges,
  testPlanItems,
  testPlanRevisions,
  testPlans,
  testResults,
  testRuns,
  users,
  withDatabase,
  type DatabaseClient,
} from "@setwin/database";
import { listProjectPipeline } from "./service.ts";

export const PLAN_LANES = [
  "critical_functional",
  "critical_nonfunctional",
  "regression_functional",
  "regression_nonfunctional",
] as const;
export type PlanLane = (typeof PLAN_LANES)[number];

export const AUTOMATION_ADAPTERS = ["playwright", "api", "unit", "integration", "selenium", "cypress"] as const;

const NON_FUNCTIONAL = /@(?:non-functional|performance|security|accessibility|reliability)\b/i;
const AUTOMATED_TAG = /@automated\b/i;
const SOURCE_PATH = /[\w./\\-]+\.(?:ts|tsx|js|jsx|py|go|java|rs)\b/gi;

const STORY_TYPES = new Set(["STORY", "REQUIREMENT", "EPIC"]);
const DESIGN_TYPES = new Set(["DESIGN", "ARCHITECTURE"]);
const TEST_TYPES = new Set(["TEST", "GHERKIN"]);

export type PlanArtifact = {
  key: string;
  type: string;
  title: string;
  content: string;
  workflowState: string;
  versionCreatedAt: string;
};

export type PlanLink = { from: string; to: string; type: string };

export type ClassifiedItem = {
  key: string;
  title: string;
  workflowState: string;
  content: string;
  lane: PlanLane;
};

export type ClassifiedPlan = {
  code: Array<{ key: string; title: string }>;
  items: ClassifiedItem[];
};

export function extractSourcePaths(content: string): string[] {
  const found = new Set<string>();
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      collectPaths(JSON.parse(trimmed), found);
    } catch {
      // plain text
    }
  }
  for (const match of content.matchAll(SOURCE_PATH)) {
    found.add(match[0].replaceAll("\\", "/").replace(/^\.?\//, ""));
  }
  return [...found];
}

function collectPaths(value: unknown, found: Set<string>): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPaths(item, found);
    }
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.path === "string" && /\.(ts|tsx|js|jsx|py|go|java|rs)$/i.test(record.path)) {
    found.add(record.path.replaceAll("\\", "/").replace(/^\.?\//, ""));
  }
  for (const nested of Object.values(record)) {
    collectPaths(nested, found);
  }
}

export function isNonFunctional(content: string): boolean {
  return NON_FUNCTIONAL.test(content);
}

export function classifyTestPlan(
  artifactsIn: PlanArtifact[],
  links: PlanLink[],
  since: Date,
  neighborFiles: string[] = [],
): ClassifiedPlan {
  const byKey = new Map(artifactsIn.map((row) => [row.key.toUpperCase(), row]));
  const sinceMs = since.getTime();
  const changed = artifactsIn.filter(
    (row) => row.type === "CODE" && Date.parse(row.versionCreatedAt) >= sinceMs,
  );
  const changedKeys = new Set(changed.map((row) => row.key.toUpperCase()));
  const neighbors = new Set(neighborFiles.map((file) => file.replaceAll("\\", "/")));

  const immediate = new Set<string>();
  for (const link of links) {
    if (link.type !== "IMPLEMENTS") {
      continue;
    }
    const from = link.from.toUpperCase();
    const to = link.to.toUpperCase();
    if (changedKeys.has(from)) {
      immediate.add(to);
    }
    if (changedKeys.has(to)) {
      immediate.add(from);
    }
  }

  const stories = new Set<string>();
  for (const key of immediate) {
    const row = byKey.get(key);
    if (row && STORY_TYPES.has(row.type)) {
      stories.add(key);
    }
  }
  for (const link of links) {
    const from = link.from.toUpperCase();
    const to = link.to.toUpperCase();
    const fromRow = byKey.get(from);
    const toRow = byKey.get(to);
    if (!fromRow || !toRow) {
      continue;
    }
    if (immediate.has(from) && DESIGN_TYPES.has(fromRow.type) && STORY_TYPES.has(toRow.type)) {
      stories.add(to);
    }
    if (immediate.has(to) && DESIGN_TYPES.has(toRow.type) && STORY_TYPES.has(fromRow.type)) {
      stories.add(from);
    }
  }

  const wider = new Set<string>(stories);
  for (const link of links) {
    const from = link.from.toUpperCase();
    const to = link.to.toUpperCase();
    const fromRow = byKey.get(from);
    const toRow = byKey.get(to);
    if (!fromRow || !toRow) {
      continue;
    }
    if (stories.has(from) && DESIGN_TYPES.has(toRow.type)) {
      wider.add(to);
    }
    if (stories.has(to) && DESIGN_TYPES.has(fromRow.type)) {
      wider.add(from);
    }
  }

  const functional = testsTouching(links, byKey, immediate);
  const onWider = testsTouching(links, byKey, wider);
  const regression = new Set<string>();
  for (const key of onWider) {
    if (!functional.has(key)) {
      regression.add(key);
    }
  }

  if (neighbors.size) {
    const neighborCode = new Set<string>();
    for (const row of artifactsIn) {
      if (row.type !== "CODE" || changedKeys.has(row.key.toUpperCase())) {
        continue;
      }
      const paths = extractSourcePaths(row.content);
      if (paths.some((file) => neighbors.has(file))) {
        neighborCode.add(row.key.toUpperCase());
      }
    }
    const viaCode = testsTouching(links, byKey, neighborCode);
    for (const link of links) {
      const from = link.from.toUpperCase();
      const to = link.to.toUpperCase();
      if (neighborCode.has(from) && byKey.get(to) && TEST_TYPES.has(byKey.get(to)!.type)) {
        viaCode.add(to);
      }
      if (neighborCode.has(to) && byKey.get(from) && TEST_TYPES.has(byKey.get(from)!.type)) {
        viaCode.add(from);
      }
    }
    for (const key of viaCode) {
      if (!functional.has(key)) {
        regression.add(key);
      }
    }
  }

  const items: ClassifiedItem[] = [];
  for (const key of new Set([...functional, ...regression])) {
    const row = byKey.get(key);
    if (!row) {
      continue;
    }
    const nonFunctional = isNonFunctional(row.content);
    const critical = functional.has(key);
    const lane: PlanLane = critical
      ? nonFunctional
        ? "critical_nonfunctional"
        : "critical_functional"
      : nonFunctional
        ? "regression_nonfunctional"
        : "regression_functional";
    items.push({
      key: row.key,
      title: row.title,
      workflowState: row.workflowState,
      content: row.content,
      lane,
    });
  }
  items.sort((a, b) => a.key.localeCompare(b.key));
  return {
    code: changed.map((row) => ({ key: row.key, title: row.title })),
    items,
  };
}

export function masterPlanName(productName: string): string {
  return `Master Test Plan - ${productName}`;
}

/** Every current test in the product, with the same four lanes. */
export function classifyMasterPlan(artifactsIn: PlanArtifact[], links: PlanLink[], neighborFiles: string[] = []): ClassifiedPlan {
  const classified = classifyTestPlan(artifactsIn, links, new Date(0), neighborFiles);
  const placed = new Set(classified.items.map((row) => row.key.toUpperCase()));
  for (const row of artifactsIn) {
    if ((row.type !== "TEST" && row.type !== "GHERKIN") || placed.has(row.key.toUpperCase())) {
      continue;
    }
    classified.items.push({
      key: row.key,
      title: row.title,
      workflowState: row.workflowState,
      content: row.content,
      lane: isNonFunctional(row.content) ? "regression_nonfunctional" : "regression_functional",
    });
  }
  classified.items.sort((a, b) => a.key.localeCompare(b.key));
  classified.code = artifactsIn.filter((row) => row.type === "CODE").map((row) => ({ key: row.key, title: row.title }));
  return classified;
}

function testsTouching(
  links: PlanLink[],
  byKey: Map<string, PlanArtifact>,
  anchors: Set<string>,
): Set<string> {
  const tests = new Set<string>();
  if (!anchors.size) {
    return tests;
  }
  for (const link of links) {
    if (link.type !== "TESTED_BY" && link.type !== "VALIDATES") {
      continue;
    }
    const from = link.from.toUpperCase();
    const to = link.to.toUpperCase();
    if (anchors.has(to) && byKey.get(from) && TEST_TYPES.has(byKey.get(from)!.type)) {
      tests.add(from);
    }
    if (anchors.has(from) && byKey.get(to) && TEST_TYPES.has(byKey.get(to)!.type)) {
      tests.add(to);
    }
  }
  return tests;
}

export type TestRunSnapshot = {
  status: "passed" | "failed" | "skipped" | "not_run";
  finishedAt: string | null;
  automated: boolean;
};

export type TestPlanTotals = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  notRun: number;
};

export function summarizeRuns(
  items: Array<{ key: string; title: string; content: string }>,
  runs: Array<{ name: string; status: string; adapter: string; finishedAt: Date | null; startedAt: Date }>,
): { totals: TestPlanTotals; byKey: Map<string, TestRunSnapshot> } {
  const byKey = new Map<string, TestRunSnapshot>();
  const totals: TestPlanTotals = { total: items.length, passed: 0, failed: 0, skipped: 0, notRun: 0 };
  for (const item of items) {
    const matches = runs
      .filter((row) => namesMatch(row.name, item.key, item.title))
      .sort((a, b) => timeOf(b) - timeOf(a));
    const latest = matches[0];
    const automated =
      AUTOMATED_TAG.test(item.content) ||
      matches.some((row) => (AUTOMATION_ADAPTERS as readonly string[]).includes(row.adapter));
    const status = latest ? normalizeStatus(latest.status) : "not_run";
    byKey.set(item.key.toUpperCase(), {
      status,
      finishedAt: latest ? (latest.finishedAt ?? latest.startedAt).toISOString() : null,
      automated,
    });
    if (status === "passed") totals.passed += 1;
    else if (status === "failed") totals.failed += 1;
    else if (status === "skipped") totals.skipped += 1;
    else totals.notRun += 1;
  }
  return { totals, byKey };
}

function namesMatch(resultName: string, key: string, title: string): boolean {
  const name = resultName.trim().toLowerCase();
  return name === key.trim().toLowerCase() || name === title.trim().toLowerCase();
}

function timeOf(row: { finishedAt: Date | null; startedAt: Date }): number {
  return (row.finishedAt ?? row.startedAt).getTime();
}

function normalizeStatus(status: string): "passed" | "failed" | "skipped" | "not_run" {
  const value = status.trim().toLowerCase();
  if (value === "passed" || value === "failed" || value === "skipped") {
    return value;
  }
  return "not_run";
}

export type TestPlanSummary = {
  id: string;
  name: string;
  projectKey: string;
  projectName: string;
  since: string;
  status: "ACTIVE" | "RELEASED";
  codeChangeCount: number;
  createdAt: string;
  updatedAt: string;
  kind: "MASTER" | "WINDOW";
  totals: TestPlanTotals;
};

export async function listTestPlans(
  databaseUrl: string,
  actor: Principal | undefined,
  includeReleased: boolean,
): Promise<TestPlanSummary[]> {
  const principal = await requirePermission(databaseUrl, actor, "artifact:view");
  await ensureMasterTestPlans(databaseUrl, principal);
  return withDatabase(databaseUrl, async ({ db }) => {
    const plans = await db.select().from(testPlans).orderBy(desc(testPlans.createdAt));
    const visible = plans.filter((row) => includeReleased || row.status === "ACTIVE");
    if (!visible.length) {
      return [];
    }
    const projectRows = await db.select().from(projects).where(inArray(projects.id, [...new Set(visible.map((row) => row.projectId))]));
    const projectById = new Map(projectRows.map((row) => [row.id, row]));
    const items = await db
      .select()
      .from(testPlanItems)
      .where(inArray(testPlanItems.planId, visible.map((row) => row.id)));
    const runs = await loadRuns(db, [...new Set(visible.map((row) => row.projectId))]);
    const rows = visible.map((plan) => {
      const project = projectById.get(plan.projectId);
      const planItems = items.filter((row) => row.planId === plan.id);
      const { totals } = summarizeRuns(planItems.map(itemView), runs.get(plan.projectId) ?? []);
      return {
        id: plan.id,
        name: plan.name,
        projectKey: project?.key ?? "",
        projectName: project?.name ?? "",
        since: plan.sinceAt.toISOString(),
        status: plan.status === "RELEASED" ? "RELEASED" : "ACTIVE",
        codeChangeCount: plan.codeChangeCount,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: (plan.updatedAt ?? plan.createdAt).toISOString(),
        kind: plan.kind === "MASTER" ? "MASTER" : "WINDOW",
        totals,
      };
    });
    rows.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === "MASTER" ? -1 : 1;
      }
      if (a.kind === "MASTER") {
        return a.name.localeCompare(b.name);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
    return rows;
  });
}

export async function getTestPlan(databaseUrl: string, id: string, actor?: Principal) {
  await requirePermission(databaseUrl, actor, "artifact:view");
  return withDatabase(databaseUrl, async ({ db }) => {
    const plan = (await db.select().from(testPlans).where(eq(testPlans.id, id)))[0];
    if (!plan) {
      throw new NotFoundError("Test plan not found");
    }
    const project = (await db.select().from(projects).where(eq(projects.id, plan.projectId)))[0];
    const items = await db.select().from(testPlanItems).where(eq(testPlanItems.planId, plan.id)).orderBy(asc(testPlanItems.artifactKey));
    const changes = await db.select().from(testPlanChanges).where(eq(testPlanChanges.planId, plan.id)).orderBy(asc(testPlanChanges.artifactKey));
    const revisions = await db
      .select({
        id: testPlanRevisions.id,
        summary: testPlanRevisions.summary,
        createdAt: testPlanRevisions.createdAt,
        actor: users.displayName,
        username: users.username,
      })
      .from(testPlanRevisions)
      .innerJoin(users, eq(users.id, testPlanRevisions.actorId))
      .where(eq(testPlanRevisions.planId, plan.id))
      .orderBy(desc(testPlanRevisions.createdAt));
    const live = items.length
      ? await db
          .select({ key: artifacts.key, content: artifactVersions.content, workflowState: artifactVersions.workflowState })
          .from(artifacts)
          .innerJoin(artifactVersions, eq(artifactVersions.id, artifacts.currentVersionId))
          .where(inArray(artifacts.key, items.map((row) => row.artifactKey)))
      : [];
    const liveByKey = new Map(live.map((row) => [row.key.toUpperCase(), row]));
    const decorated = items.map((row) => {
      const current = liveByKey.get(row.artifactKey.toUpperCase());
      return {
        key: row.artifactKey,
        title: row.title,
        workflowState: current?.workflowState ?? row.workflowState,
        content: current?.content ?? row.content,
        lane: row.lane as PlanLane,
      };
    });
    const runs = await loadRuns(db, [plan.projectId]);
    const { totals, byKey } = summarizeRuns(decorated, runs.get(plan.projectId) ?? []);
    return {
      id: plan.id,
      name: plan.name,
      projectKey: project?.key ?? "",
      projectName: project?.name ?? "",
      since: plan.sinceAt.toISOString(),
      status: plan.status === "RELEASED" ? "RELEASED" : "ACTIVE",
      codeChangeCount: plan.codeChangeCount,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: (plan.updatedAt ?? plan.createdAt).toISOString(),
      kind: plan.kind === "MASTER" ? "MASTER" : "WINDOW",
      releasedAt: plan.releasedAt?.toISOString() ?? null,
      totals,
      code: changes.map((row) => ({ key: row.artifactKey, title: row.title })),
      items: decorated.map((row) => {
        const run = byKey.get(row.key.toUpperCase());
        return {
          key: row.key,
          title: row.title,
          workflowState: row.workflowState,
          lane: row.lane,
          automation: run?.automated ? "Automated" : "Manual",
          runStatus: run?.status ?? "not_run",
          runFinishedAt: run?.finishedAt ?? null,
        };
      }),
      revisions: revisions.map((row) => ({
        id: row.id,
        summary: row.summary,
        at: row.createdAt.toISOString(),
        actor: row.actor || row.username,
      })),
    };
  });
}

export async function createTestPlan(
  databaseUrl: string,
  input: { project: string; since: string; neighborFiles?: string[] },
  actor?: Principal,
) {
  const principal = await requirePermission(databaseUrl, actor, "artifact:create");
  const since = new Date(input.since);
  if (Number.isNaN(since.getTime())) {
    throw new ValidationError("since must be a date and time");
  }
  const loaded = await listProjectPipeline(databaseUrl, input.project, principal);
  const project = await withDatabase(databaseUrl, async ({ db }) => {
    const row = (await db.select().from(projects).where(eq(projects.key, input.project.trim().toLowerCase())))[0];
    if (!row) {
      throw new NotFoundError(`Project not found: ${input.project}`);
    }
    return row;
  });
  const classified = classifyTestPlan(
    loaded.artifacts.map((row) => ({
      key: row.key,
      type: row.type,
      title: row.currentVersion.title,
      content: row.currentVersion.content,
      workflowState: row.currentVersion.workflowState,
      versionCreatedAt: row.currentVersion.provenance.createdAt.toISOString(),
    })),
    loaded.relationships,
    since,
    input.neighborFiles ?? [],
  );
  const stamp = since.toISOString().slice(0, 16).replace("T", " ");
  const name = `${project.name} since ${stamp}`;
  const id = randomUUID();
  const now = new Date();
  await withDatabase(databaseUrl, async ({ db }) => {
    await db.insert(testPlans).values({
      id,
      projectId: project.id,
      name,
      sinceAt: since,
      status: "ACTIVE",
      codeChangeCount: classified.code.length,
      createdBy: principal.id,
      createdAt: now,
      releasedAt: null,
      releasedBy: null,
      kind: "WINDOW",
      updatedAt: now,
    });
    if (classified.items.length) {
      await db.insert(testPlanItems).values(
        classified.items.map((row) => ({
          id: randomUUID(),
          planId: id,
          artifactKey: row.key,
          title: row.title,
          workflowState: row.workflowState,
          lane: row.lane,
          content: row.content,
        })),
      );
    }
    if (classified.code.length) {
      await db.insert(testPlanChanges).values(
        classified.code.map((row) => ({
          id: randomUUID(),
          planId: id,
          artifactKey: row.key,
          title: row.title,
        })),
      );
    }
    await db.insert(testPlanRevisions).values({
      id: randomUUID(),
      planId: id,
      actorId: principal.id,
      summary: `Created with ${classified.items.length} tests and ${classified.code.length} code changes`,
      createdAt: now,
    });
  });
  return getTestPlan(databaseUrl, id, principal);
}

export async function renameTestPlan(databaseUrl: string, id: string, name: string, actor?: Principal) {
  const principal = await requirePermission(databaseUrl, actor, "artifact:create");
  const next = name.trim();
  if (!next) {
    throw new ValidationError("Name is required");
  }
  await withDatabase(databaseUrl, async ({ db }) => {
    const plan = (await db.select().from(testPlans).where(eq(testPlans.id, id)))[0];
    if (!plan) {
      throw new NotFoundError("Test plan not found");
    }
    if (plan.kind === "MASTER") {
      throw new ConflictError("The master test plan name follows the product name");
    }
    if (plan.status === "RELEASED") {
      throw new ConflictError("A released test plan is locked");
    }
    if (plan.name === next) {
      return;
    }
    await db.update(testPlans).set({ name: next, updatedAt: new Date() }).where(and(eq(testPlans.id, id), eq(testPlans.status, "ACTIVE")));
    await db.insert(testPlanRevisions).values({
      id: randomUUID(),
      planId: id,
      actorId: principal.id,
      summary: `Renamed from "${plan.name}" to "${next}"`,
      createdAt: new Date(),
    });
  });
  return getTestPlan(databaseUrl, id, principal);
}

export async function releaseTestPlan(databaseUrl: string, id: string, actor?: Principal) {
  const principal = await requirePermission(databaseUrl, actor, "artifact:create");
  await withDatabase(databaseUrl, async ({ db }) => {
    const plan = (await db.select().from(testPlans).where(eq(testPlans.id, id)))[0];
    if (!plan) {
      throw new NotFoundError("Test plan not found");
    }
    if (plan.kind === "MASTER") {
      throw new ConflictError("The master test plan stays active and is rebaselined as the product changes");
    }
    if (plan.status === "RELEASED") {
      throw new ConflictError("This test plan is already released");
    }
    const now = new Date();
    const updated = await db
      .update(testPlans)
      .set({ status: "RELEASED", releasedAt: now, releasedBy: principal.id, updatedAt: now })
      .where(and(eq(testPlans.id, id), eq(testPlans.status, "ACTIVE")))
      .returning({ id: testPlans.id });
    if (!updated.length) {
      throw new ConflictError("This test plan is already released");
    }
    await db.insert(testPlanRevisions).values({
      id: randomUUID(),
      planId: id,
      actorId: principal.id,
      summary: "Released. Name, window, and tests are locked.",
      createdAt: now,
    });
  });
  return getTestPlan(databaseUrl, id, principal);
}

export async function ensureMasterTestPlans(databaseUrl: string, actor: Principal): Promise<void> {
  const snapshot = await withDatabase(databaseUrl, async ({ db }) => {
    const projectRows = await db.select().from(projects);
    const masters = await db.select().from(testPlans).where(eq(testPlans.kind, "MASTER"));
    return { projectRows, masters };
  });
  for (const project of snapshot.projectRows) {
    let master = snapshot.masters.find((row) => row.projectId === project.id);
    if (!master) {
      master = await insertMasterPlan(databaseUrl, project.id, project.name, project.createdAt, actor.id);
    }
    await rebaselineMasterTestPlan(databaseUrl, master.id, actor, { touch: false });
  }
}

export async function rebaselineMasterTestPlan(
  databaseUrl: string,
  id: string,
  actor?: Principal,
  options?: { touch?: boolean },
) {
  const principal = await requirePermission(databaseUrl, actor, "artifact:view");
  const plan = await withDatabase(databaseUrl, async ({ db }) => {
    const row = (await db.select().from(testPlans).where(eq(testPlans.id, id)))[0];
    if (!row) {
      throw new NotFoundError("Test plan not found");
    }
    if (row.kind !== "MASTER") {
      throw new ConflictError("Only the master test plan can be rebaselined");
    }
    return row;
  });
  const project = await withDatabase(databaseUrl, async ({ db }) => {
    const row = (await db.select().from(projects).where(eq(projects.id, plan.projectId)))[0];
    if (!row) {
      throw new NotFoundError("Project not found");
    }
    return row;
  });
  const loaded = await listProjectPipeline(databaseUrl, project.key, principal);
  const classified = classifyMasterPlan(
    loaded.artifacts.map((row) => ({
      key: row.key,
      type: row.type,
      title: row.currentVersion.title,
      content: row.currentVersion.content,
      workflowState: row.currentVersion.workflowState,
      versionCreatedAt: row.currentVersion.provenance.createdAt.toISOString(),
    })),
    loaded.relationships,
  );
  const name = masterPlanName(project.name);
  const currentItems = await withDatabase(databaseUrl, async ({ db }) => {
    const items = await db.select().from(testPlanItems).where(eq(testPlanItems.planId, plan.id));
    const changes = await db.select().from(testPlanChanges).where(eq(testPlanChanges.planId, plan.id));
    return { items, changes };
  });
  const before = planFingerprint(
    plan.name,
    currentItems.items.map((row) => ({
      key: row.artifactKey,
      lane: row.lane,
      title: row.title,
      workflowState: row.workflowState,
      content: row.content,
    })),
    currentItems.changes.map((row) => row.artifactKey),
  );
  const after = planFingerprint(
    name,
    classified.items.map((row) => ({
      key: row.key,
      lane: row.lane,
      title: row.title,
      workflowState: row.workflowState,
      content: row.content,
    })),
    classified.code.map((row) => row.key),
  );
  if (before === after && !options?.touch) {
    return getTestPlan(databaseUrl, plan.id, principal);
  }
  const now = new Date();
  await withDatabase(databaseUrl, async ({ db }) => {
    await db.delete(testPlanItems).where(eq(testPlanItems.planId, plan.id));
    await db.delete(testPlanChanges).where(eq(testPlanChanges.planId, plan.id));
    if (classified.items.length) {
      await db.insert(testPlanItems).values(
        classified.items.map((row) => ({
          id: randomUUID(),
          planId: plan.id,
          artifactKey: row.key,
          title: row.title,
          workflowState: row.workflowState,
          lane: row.lane,
          content: row.content,
        })),
      );
    }
    if (classified.code.length) {
      await db.insert(testPlanChanges).values(
        classified.code.map((row) => ({
          id: randomUUID(),
          planId: plan.id,
          artifactKey: row.key,
          title: row.title,
        })),
      );
    }
    await db
      .update(testPlans)
      .set({ name, codeChangeCount: classified.code.length, updatedAt: now })
      .where(eq(testPlans.id, plan.id));
    await db.insert(testPlanRevisions).values({
      id: randomUUID(),
      planId: plan.id,
      actorId: principal.id,
      summary: options?.touch
        ? `Rebaselined with ${classified.items.length} tests`
        : `Updated from the product with ${classified.items.length} tests`,
      createdAt: now,
    });
  });
  return getTestPlan(databaseUrl, plan.id, principal);
}

async function insertMasterPlan(
  databaseUrl: string,
  projectId: string,
  productName: string,
  since: Date,
  actorId: string,
) {
  const now = new Date();
  const id = randomUUID();
  try {
    await withDatabase(databaseUrl, async ({ db }) => {
      await db.insert(testPlans).values({
        id,
        projectId,
        name: masterPlanName(productName),
        sinceAt: since,
        status: "ACTIVE",
        codeChangeCount: 0,
        createdBy: actorId,
        createdAt: now,
        releasedAt: null,
        releasedBy: null,
        kind: "MASTER",
        updatedAt: now,
      });
      await db.insert(testPlanRevisions).values({
        id: randomUUID(),
        planId: id,
        actorId,
        summary: "Created the master test plan",
        createdAt: now,
      });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
  }
  const row = await withDatabase(databaseUrl, async ({ db }) => {
    const masters = await db
      .select()
      .from(testPlans)
      .where(and(eq(testPlans.projectId, projectId), eq(testPlans.kind, "MASTER")));
    return masters[0];
  });
  if (!row) {
    throw new NotFoundError("Master test plan was not created");
  }
  return row;
}

function planFingerprint(
  name: string,
  items: Array<{ key: string; lane: string; title: string; workflowState: string; content: string }>,
  codeKeys: string[],
): string {
  const tests = items
    .map((row) => `${row.key}\t${row.lane}\t${row.title}\t${row.workflowState}\t${row.content}`)
    .sort();
  return JSON.stringify({ name, tests, code: [...codeKeys].sort() });
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ("code" in error && (error as { code?: string }).code === "23505") {
    return true;
  }
  if ("cause" in error) {
    return isUniqueViolation((error as { cause?: unknown }).cause);
  }
  return false;
}

function itemView(row: { artifactKey: string; title: string; content: string }) {
  return { key: row.artifactKey, title: row.title, content: row.content };
}

async function loadRuns(
  db: DatabaseClient["db"],
  projectIds: string[],
): Promise<Map<string, Array<{ name: string; status: string; adapter: string; finishedAt: Date | null; startedAt: Date }>>> {
  const grouped = new Map<string, Array<{ name: string; status: string; adapter: string; finishedAt: Date | null; startedAt: Date }>>();
  if (!projectIds.length) {
    return grouped;
  }
  const rows = await db
    .select({
      projectId: testRuns.projectId,
      name: testResults.name,
      status: testResults.status,
      adapter: testRuns.adapter,
      finishedAt: testRuns.finishedAt,
      startedAt: testRuns.startedAt,
    })
    .from(testResults)
    .innerJoin(testRuns, eq(testRuns.id, testResults.runId))
    .where(inArray(testRuns.projectId, projectIds));
  for (const row of rows) {
    const list = grouped.get(row.projectId) ?? [];
    list.push(row);
    grouped.set(row.projectId, list);
  }
  return grouped;
}
