import { randomUUID } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  requirePermission,
  type PermissionKey,
  type Principal,
} from "@setwin/auth";
import {
  approvalDecisions,
  approvalPolicies,
  approvalRequests,
  artifactVersions,
  reviewFindings,
  reviews,
  roles,
  userRoles,
  users,
  withDatabase,
  workflowTransitions,
} from "@setwin/database";
import { getArtifact } from "./service.ts";
import { DEFAULT_APPROVAL_POLICIES } from "./review-catalog.ts";
import { WORKFLOW_GRAPH } from "./workflow-catalog.ts";
import {
  APPROVAL_MODES,
  FINDING_SEVERITIES,
  REVIEW_DECISIONS,
  WORKFLOW_ACTIONS,
  type ApprovalMode,
  type ApprovalPolicyRecord,
  type ApprovalRequestRecord,
  type ApprovalRequestStatus,
  type FindingSeverity,
  type ReviewDecision,
  type ReviewFindingRecord,
  type ReviewRecord,
  type ReviewStatus,
  type WorkflowAction,
  type WorkflowRecord,
  type WorkflowState,
} from "./types.ts";

type StoredRequest = typeof approvalRequests.$inferSelect;

export async function seedApprovalPolicies(databaseUrl: string): Promise<void> {
  await withDatabase(databaseUrl, async ({ db }) => {
    for (const policy of DEFAULT_APPROVAL_POLICIES) {
      await db
        .insert(approvalPolicies)
        .values({
          id: randomUUID(),
          artifactType: policy.artifactType,
          requiredRole: policy.requiredRole,
          sortOrder: policy.sortOrder,
          mode: policy.mode,
        })
        .onConflictDoNothing({ target: [approvalPolicies.artifactType, approvalPolicies.requiredRole] });
    }
  });
}

export async function listApprovalPolicies(
  databaseUrl: string,
  actor?: Principal,
): Promise<ApprovalPolicyRecord[]> {
  await requirePermission(databaseUrl, actor, "artifact:view");
  return withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db
      .select()
      .from(approvalPolicies)
      .orderBy(asc(approvalPolicies.artifactType), asc(approvalPolicies.sortOrder));
    return rows.map(toPolicyRecord);
  });
}

export async function openReviewForVersion(
  databaseUrl: string,
  key: string,
  actor: Principal,
  dueAt?: Date,
): Promise<ReviewRecord> {
  const artifact = await getArtifact(databaseUrl, key, actor);
  const current = artifact.currentVersion;
  if (current.workflowState !== "IN_REVIEW") {
    throw new ConflictError(`Cannot open a review while ${current.workflowState}`);
  }
  const policies = await loadApprovalRoles(databaseUrl, artifact.type);
  await withDatabase(databaseUrl, async ({ db }) => {
    const existing = (
      await db.select().from(reviews).where(eq(reviews.artifactVersionId, current.id))
    )[0];
    if (existing) {
      return;
    }
    const reviewId = randomUUID();
    const now = new Date();
    await db.insert(reviews).values({
      id: reviewId,
      artifactVersionId: current.id,
      status: "OPEN",
      createdBy: actor.id,
      createdAt: now,
      completedAt: null,
    });
    const mode = policies[0]?.mode ?? "PARALLEL";
    for (const [index, policy] of policies.entries()) {
      const status: ApprovalRequestStatus = mode === "SEQUENTIAL" && index > 0 ? "BLOCKED" : "PENDING";
      await db.insert(approvalRequests).values({
        id: randomUUID(),
        reviewId,
        requiredRole: policy.requiredRole,
        assigneeUserId: null,
        status,
        sortOrder: policy.sortOrder,
        delegatedFromUserId: null,
        escalatedFromRole: null,
        dueAt: dueAt ?? null,
        decidedAt: null,
      });
    }
  });
  return getReview(databaseUrl, artifact.key, actor);
}

export async function getReview(databaseUrl: string, key: string, actor?: Principal): Promise<ReviewRecord> {
  const review = await findReview(databaseUrl, key, actor);
  if (!review) {
    throw new NotFoundError(`No review for ${key}`);
  }
  return review;
}

export async function findReview(
  databaseUrl: string,
  key: string,
  actor?: Principal,
): Promise<ReviewRecord | null> {
  const artifact = await getArtifact(databaseUrl, key, actor);
  const loaded = await loadReview(databaseUrl, artifact.currentVersion.id, artifact.key, artifact.currentVersion.version, artifact.currentVersion.workflowState);
  if (loaded) {
    return loaded;
  }
  if (artifact.currentVersion.workflowState === "IN_REVIEW" && actor) {
    return openReviewForVersion(databaseUrl, artifact.key, actor);
  }
  return null;
}

export async function findExistingReview(
  databaseUrl: string,
  key: string,
  actor?: Principal,
): Promise<ReviewRecord | null> {
  const artifact = await getArtifact(databaseUrl, key, actor);
  return loadReview(
    databaseUrl,
    artifact.currentVersion.id,
    artifact.key,
    artifact.currentVersion.version,
    artifact.currentVersion.workflowState,
  );
}

export async function addReviewFinding(
  databaseUrl: string,
  key: string,
  input: { severity: string; summary: string },
  actor?: Principal,
): Promise<ReviewRecord> {
  const principal = await requirePermission(databaseUrl, actor, "artifact:view");
  const review = await requireOpenReview(databaseUrl, key, principal);
  const severity = parseFindingSeverity(input.severity);
  const summary = input.summary.trim();
  if (!summary) {
    throw new ValidationError("Finding summary is required");
  }
  await withDatabase(databaseUrl, async ({ db }) => {
    await db.insert(reviewFindings).values({
      id: randomUUID(),
      reviewId: review.id,
      severity,
      summary,
      resolved: false,
      createdBy: principal.id,
      createdAt: new Date(),
    });
  });
  return getReview(databaseUrl, key, principal);
}

export async function recordReviewDecision(
  databaseUrl: string,
  key: string,
  actionInput: string,
  actor?: Principal,
  comment = "",
): Promise<WorkflowRecord> {
  const action = parseWorkflowAction(actionInput);
  const decision = decisionFromAction(action);
  const permission = permissionForDecision(decision);
  const principal = await requirePermission(databaseUrl, actor, permission);
  const artifact = await getArtifact(databaseUrl, key, principal);
  const current = artifact.currentVersion;
  if (current.status === "SUPERSEDED") {
    throw new ConflictError(`Cannot transition superseded version of ${artifact.key}`);
  }
  const graph = WORKFLOW_GRAPH[action];
  if (!graph.from.includes(current.workflowState)) {
    throw new ConflictError(`Cannot ${action} from ${current.workflowState}. Allowed from: ${graph.from.join(", ")}.`);
  }
  const review = await requireOpenReview(databaseUrl, artifact.key, principal);
  const targets = selectableRequests(review.requests, principal, decision);
  if (targets.length === 0) {
    throw new AuthorizationError(`No pending approval request for ${principal.username}`);
  }

  if (decision === "APPROVE") {
    assertCanApprove(principal, artifact.createdBy, current.provenance.createdBy, review);
  }

  const now = new Date();
  const fulfillAll = principal.roles.includes("administrator") && decision === "APPROVE";
  const chosen = fulfillAll
    ? review.requests.filter((row) => row.status === "PENDING" || row.status === "BLOCKED")
    : [targets[0]];

  await withDatabase(databaseUrl, async ({ db }) => {
    for (const request of chosen) {
      if (request.dueAt && request.dueAt.getTime() < now.getTime() && decision === "APPROVE" && !principal.roles.includes("administrator")) {
        throw new ConflictError("Approval request expired; escalate or re-submit.");
      }
      await db.insert(approvalDecisions).values({
        id: randomUUID(),
        requestId: request.id,
        actorId: principal.id,
        decision,
        comment: comment.trim(),
        createdAt: now,
      });
      const requestStatus: ApprovalRequestStatus =
        decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED";
      await db
        .update(approvalRequests)
        .set({ status: requestStatus, decidedAt: now })
        .where(eq(approvalRequests.id, request.id));
    }

    const latest = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.reviewId, review.id))
      .orderBy(asc(approvalRequests.sortOrder));
    const nextState = nextWorkflowState(latest, decision);
    if (!nextState) {
      const mode = (await loadApprovalRoles(databaseUrl, artifact.type))[0]?.mode ?? "PARALLEL";
      if (mode === "SEQUENTIAL" && decision === "APPROVE") {
        const nextBlocked = latest.find((row) => row.status === "BLOCKED");
        if (nextBlocked) {
          await db.update(approvalRequests).set({ status: "PENDING" }).where(eq(approvalRequests.id, nextBlocked.id));
        }
      }
      return;
    }

    await db
      .update(reviews)
      .set({ status: "COMPLETED", completedAt: now })
      .where(eq(reviews.id, review.id));
    const patch: { workflowState: WorkflowState; status?: "APPROVED" } = { workflowState: nextState };
    if (nextState === "APPROVED") {
      patch.status = "APPROVED";
    }
    await db.update(artifactVersions).set(patch).where(eq(artifactVersions.id, current.id));
    await db.insert(workflowTransitions).values({
      id: randomUUID(),
      artifactVersionId: current.id,
      fromState: current.workflowState,
      toState: nextState,
      action,
      actorId: principal.id,
      comment: comment.trim(),
      createdAt: now,
    });
  });

  const { getWorkflow } = await import("./workflow.ts");
  const workflow = await getWorkflow(databaseUrl, artifact.key, principal);
  const { recordAuditEvent } = await import("@setwin/audit");
  await recordAuditEvent(databaseUrl, {
    action: `review.${decision.toLowerCase()}`,
    entityType: "artifact",
    entityId: artifact.id,
    entityKey: artifact.key,
    version: current.version,
    before: { workflowState: current.workflowState },
    after: { workflowState: workflow.currentState, decision },
    actor: principal,
  });
  return workflow;
}

export async function delegateApproval(
  databaseUrl: string,
  key: string,
  input: { to: string; role?: string },
  actor?: Principal,
): Promise<ReviewRecord> {
  const principal = await requirePermission(databaseUrl, actor, "artifact:view");
  const review = await requireOpenReview(databaseUrl, key, principal);
  const request = pickActableRequest(review.requests, principal, input.role);
  const target = await loadUserWithRoles(databaseUrl, input.to);
  if (!target.roles.includes(request.requiredRole) && !target.roles.includes("administrator")) {
    throw new AuthorizationError(`${target.username} does not have role ${request.requiredRole}`);
  }
  await withDatabase(databaseUrl, async ({ db }) => {
    await db
      .update(approvalRequests)
      .set({
        assigneeUserId: target.id,
        delegatedFromUserId: principal.id,
      })
      .where(eq(approvalRequests.id, request.id));
  });
  return getReview(databaseUrl, key, principal);
}

export async function escalateApproval(
  databaseUrl: string,
  key: string,
  input: { toRole: string; to?: string },
  actor?: Principal,
): Promise<ReviewRecord> {
  const principal = await requirePermission(databaseUrl, actor, "artifact:view");
  const review = await requireOpenReview(databaseUrl, key, principal);
  const request = pickActableRequest(review.requests, principal, undefined);
  const toRole = input.toRole.trim();
  if (!toRole) {
    throw new ValidationError("Escalation role is required");
  }
  const roleExists = await withDatabase(databaseUrl, async ({ db }) => {
    return (await db.select().from(roles).where(eq(roles.name, toRole)))[0];
  });
  if (!roleExists) {
    throw new ValidationError(`Unknown role: ${toRole}`);
  }
  let assigneeId: string | null = null;
  if (input.to) {
    const target = await loadUserWithRoles(databaseUrl, input.to);
    if (!target.roles.includes(toRole) && !target.roles.includes("administrator")) {
      throw new AuthorizationError(`${target.username} does not have role ${toRole}`);
    }
    assigneeId = target.id;
  }
  await withDatabase(databaseUrl, async ({ db }) => {
    await db
      .update(approvalRequests)
      .set({
        requiredRole: toRole,
        escalatedFromRole: request.requiredRole,
        assigneeUserId: assigneeId,
        dueAt: null,
      })
      .where(eq(approvalRequests.id, request.id));
  });
  return getReview(databaseUrl, key, principal);
}

export function parseFindingSeverity(value: string): FindingSeverity {
  const severity = value.trim().toUpperCase();
  if (!FINDING_SEVERITIES.includes(severity as FindingSeverity)) {
    throw new ValidationError(`Unknown finding severity: ${value}`);
  }
  return severity as FindingSeverity;
}

export function parseReviewDecision(value: string): ReviewDecision {
  const normalized = value.trim().toUpperCase().replaceAll("-", "_");
  if (normalized === "APPROVE") {
    return "APPROVE";
  }
  if (normalized === "REJECT") {
    return "REJECT";
  }
  if (normalized === "REQUEST_CHANGES" || normalized === "CHANGES_REQUESTED") {
    return "CHANGES_REQUESTED";
  }
  throw new ValidationError(`Unknown review decision: ${value}`);
}

async function requireOpenReview(databaseUrl: string, key: string, actor: Principal): Promise<ReviewRecord> {
  const review = await findReview(databaseUrl, key, actor);
  if (!review) {
    throw new NotFoundError(`No review for ${key}`);
  }
  if (review.status !== "OPEN") {
    throw new ConflictError(`Review for ${key} is ${review.status}`);
  }
  return review;
}

async function loadReview(
  databaseUrl: string,
  versionId: string,
  artifactKey: string,
  version: number,
  workflowState: WorkflowState,
): Promise<ReviewRecord | null> {
  return withDatabase(databaseUrl, async ({ db }) => {
    const review = (await db.select().from(reviews).where(eq(reviews.artifactVersionId, versionId)))[0];
    if (!review) {
      return null;
    }
    const findingRows = await db
      .select()
      .from(reviewFindings)
      .where(eq(reviewFindings.reviewId, review.id))
      .orderBy(asc(reviewFindings.createdAt));
    const requestRows = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.reviewId, review.id))
      .orderBy(asc(approvalRequests.sortOrder));
    const requestIds = requestRows.map((row) => row.id);
    const decisionRows =
      requestIds.length === 0
        ? []
        : await db.select().from(approvalDecisions).where(inArray(approvalDecisions.requestId, requestIds));
    const userIds = [
      ...requestRows.flatMap((row) => [row.assigneeUserId, row.delegatedFromUserId]),
      ...decisionRows.map((row) => row.actorId),
    ].filter((id): id is string => Boolean(id));
    const userRows =
      userIds.length === 0
        ? []
        : await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, userIds));
    const usernames = new Map(userRows.map((row) => [row.id, row.username]));
    return {
      id: review.id,
      artifactKey,
      version,
      workflowState,
      status: review.status as ReviewStatus,
      findings: findingRows.map(
        (row): ReviewFindingRecord => ({
          id: row.id,
          severity: row.severity as FindingSeverity,
          summary: row.summary,
          resolved: row.resolved,
          createdBy: row.createdBy,
          createdAt: row.createdAt,
        }),
      ),
      requests: requestRows.map((row): ApprovalRequestRecord => {
        const decisions = decisionRows
          .filter((decision) => decision.requestId === row.id)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
        return {
          id: row.id,
          requiredRole: row.requiredRole,
          assigneeUserId: row.assigneeUserId,
          assigneeUsername: row.assigneeUserId ? (usernames.get(row.assigneeUserId) ?? null) : null,
          status: row.status as ApprovalRequestStatus,
          sortOrder: row.sortOrder,
          delegatedFromUserId: row.delegatedFromUserId,
          delegatedFromUsername: row.delegatedFromUserId ? (usernames.get(row.delegatedFromUserId) ?? null) : null,
          escalatedFromRole: row.escalatedFromRole,
          dueAt: row.dueAt,
          decidedAt: row.decidedAt,
          decisions: decisions.map((decision) => ({
            id: decision.id,
            actorId: decision.actorId,
            actorUsername: usernames.get(decision.actorId) ?? decision.actorId,
            decision: decision.decision as ReviewDecision,
            comment: decision.comment,
            createdAt: decision.createdAt,
          })),
        };
      }),
    };
  });
}

async function loadApprovalRoles(databaseUrl: string, artifactType: string): Promise<ApprovalPolicyRecord[]> {
  return withDatabase(databaseUrl, async ({ db }) => {
    const rows = (await db.select().from(approvalPolicies).where(eq(approvalPolicies.artifactType, artifactType))).sort(
      (left, right) => left.sortOrder - right.sortOrder,
    );
    if (rows.length > 0) {
      return rows.map(toPolicyRecord);
    }
    return DEFAULT_APPROVAL_POLICIES.filter((policy) => policy.artifactType === artifactType).map((policy) => ({
      artifactType: policy.artifactType,
      requiredRole: policy.requiredRole,
      sortOrder: policy.sortOrder,
      mode: policy.mode,
    }));
  });
}

function toPolicyRecord(row: { artifactType: string; requiredRole: string; sortOrder: number; mode: string }): ApprovalPolicyRecord {
  if (!APPROVAL_MODES.includes(row.mode as ApprovalMode)) {
    throw new ConflictError(`Unknown approval mode: ${row.mode}`);
  }
  return {
    artifactType: row.artifactType,
    requiredRole: row.requiredRole,
    sortOrder: row.sortOrder,
    mode: row.mode as ApprovalMode,
  };
}

function selectableRequests(
  requests: ApprovalRequestRecord[],
  principal: Principal,
  decision: ReviewDecision,
): ApprovalRequestRecord[] {
  const pending = requests
    .filter((row) => row.status === "PENDING")
    .sort((left, right) => left.sortOrder - right.sortOrder);
  if (principal.roles.includes("administrator")) {
    return pending;
  }
  return pending.filter((row) => canActOnRequest(row, principal, decision));
}

function pickActableRequest(
  requests: ApprovalRequestRecord[],
  principal: Principal,
  role: string | undefined,
): ApprovalRequestRecord {
  const pending = requests.filter((row) => row.status === "PENDING");
  const filtered = role ? pending.filter((row) => row.requiredRole === role) : pending;
  const match = principal.roles.includes("administrator")
    ? filtered[0]
    : filtered.find((row) => canActOnRequest(row, principal, "APPROVE") || canActOnRequest(row, principal, "REJECT"));
  if (!match) {
    throw new AuthorizationError("No pending approval request you can act on");
  }
  return match;
}

function canActOnRequest(request: ApprovalRequestRecord, principal: Principal, _decision: ReviewDecision): boolean {
  if (request.status !== "PENDING") {
    return false;
  }
  if (request.assigneeUserId && request.assigneeUserId !== principal.id && !principal.roles.includes("administrator")) {
    return false;
  }
  return principal.roles.includes(request.requiredRole) || principal.roles.includes("administrator");
}

function assertCanApprove(
  principal: Principal,
  artifactCreatedBy: string,
  versionCreatedBy: string,
  review: ReviewRecord,
): void {
  if (principal.roles.includes("administrator")) {
    return;
  }
  if (principal.id === artifactCreatedBy || principal.id === versionCreatedBy) {
    throw new AuthorizationError("Separation of duties: the author cannot approve this artifact");
  }
  const blocking = review.findings.some((finding) => finding.severity === "HIGH" && !finding.resolved);
  if (blocking) {
    throw new ConflictError("Unresolved HIGH findings block approval");
  }
}

function nextWorkflowState(requests: StoredRequest[], lastDecision: ReviewDecision): WorkflowState | null {
  if (lastDecision === "REJECT" || requests.some((row) => row.status === "REJECTED")) {
    return "REJECTED";
  }
  if (lastDecision === "CHANGES_REQUESTED" || requests.some((row) => row.status === "CHANGES_REQUESTED")) {
    return "CHANGES_REQUESTED";
  }
  const remaining = requests.filter((row) => row.status === "PENDING" || row.status === "BLOCKED");
  if (remaining.length === 0 && requests.every((row) => row.status === "APPROVED")) {
    return "APPROVED";
  }
  return null;
}

function decisionFromAction(action: WorkflowAction): ReviewDecision {
  if (action === "approve") {
    return "APPROVE";
  }
  if (action === "reject") {
    return "REJECT";
  }
  if (action === "request_changes") {
    return "CHANGES_REQUESTED";
  }
  throw new ValidationError(`Not a review decision: ${action}`);
}

function permissionForDecision(decision: ReviewDecision): PermissionKey {
  if (decision === "APPROVE") {
    return "artifact:approve";
  }
  if (decision === "REJECT") {
    return "artifact:reject";
  }
  return "artifact:request_changes";
}

function parseWorkflowAction(value: string): WorkflowAction {
  const action = value.trim().toLowerCase().replaceAll("-", "_");
  if (!WORKFLOW_ACTIONS.includes(action as WorkflowAction)) {
    throw new ValidationError(`Unknown workflow action: ${value}`);
  }
  return action as WorkflowAction;
}

async function loadUserWithRoles(
  databaseUrl: string,
  username: string,
): Promise<{ id: string; username: string; roles: string[] }> {
  return withDatabase(databaseUrl, async ({ db }) => {
    const user = (await db.select().from(users).where(eq(users.username, username.trim())))[0];
    if (!user || user.disabled) {
      throw new NotFoundError(`Unknown user: ${username}`);
    }
    const roleRows = await db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, user.id));
    return { id: user.id, username: user.username, roles: roleRows.map((row) => row.name) };
  });
}

export function actionFromDecision(decision: ReviewDecision): WorkflowAction {
  if (decision === "APPROVE") {
    return "approve";
  }
  if (decision === "REJECT") {
    return "reject";
  }
  return "request_changes";
}
