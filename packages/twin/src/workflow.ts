import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import {
  AuthorizationError,
  ConflictError,
  ValidationError,
  requirePermission,
  type PermissionKey,
  type Principal,
} from "@setwin/auth";
import { artifactVersions, withDatabase, workflowPolicies, workflowTransitions } from "@setwin/database";
import { findReview, openReviewForVersion, recordReviewDecision, seedApprovalPolicies } from "./review.ts";
import { getArtifact } from "./service.ts";
import {
  WORKFLOW_ACTIONS,
  type WorkflowAction,
  type WorkflowHistoryRecord,
  type WorkflowPolicyRecord,
  type WorkflowRecord,
  type WorkflowState,
} from "./types.ts";
import { DEFAULT_WORKFLOW_POLICIES, WORKFLOW_GRAPH, allowedActionsFor } from "./workflow-catalog.ts";

export async function seedWorkflowPolicies(databaseUrl: string): Promise<void> {
  await withDatabase(databaseUrl, async ({ db }) => {
    for (const policy of DEFAULT_WORKFLOW_POLICIES) {
      await db
        .insert(workflowPolicies)
        .values({
          id: randomUUID(),
          artifactType: policy.artifactType,
          action: policy.action,
          requiredPermission: policy.requiredPermission,
          requiredRole: policy.requiredRole,
        })
        .onConflictDoNothing({ target: [workflowPolicies.artifactType, workflowPolicies.action] });
    }
  });
  await seedApprovalPolicies(databaseUrl);
}

export async function listWorkflowPolicies(databaseUrl: string, actor?: Principal): Promise<WorkflowPolicyRecord[]> {
  await requirePermission(databaseUrl, actor, "artifact:view");
  return withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db.select().from(workflowPolicies).orderBy(asc(workflowPolicies.artifactType), asc(workflowPolicies.action));
    return rows.map((row) => ({
      artifactType: row.artifactType,
      action: row.action as WorkflowAction,
      requiredPermission: row.requiredPermission,
      requiredRole: row.requiredRole,
    }));
  });
}

export async function getWorkflow(databaseUrl: string, key: string, actor?: Principal): Promise<WorkflowRecord> {
  const artifact = await getArtifact(databaseUrl, key, actor);
  const history = await withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db
      .select()
      .from(workflowTransitions)
      .where(eq(workflowTransitions.artifactVersionId, artifact.currentVersion.id))
      .orderBy(asc(workflowTransitions.createdAt));
    return rows.map(
      (row): WorkflowHistoryRecord => ({
        fromState: row.fromState as WorkflowState,
        toState: row.toState as WorkflowState,
        action: row.action as WorkflowAction,
        actorId: row.actorId,
        comment: row.comment,
        createdAt: row.createdAt,
      }),
    );
  });
  const state = artifact.currentVersion.workflowState;
  const review = await findReview(databaseUrl, artifact.key, actor);
  return {
    artifact,
    state,
    allowedActions: artifact.currentVersion.status === "SUPERSEDED" ? [] : allowedActionsFor(state),
    history,
    review,
  };
}

export async function transitionWorkflow(
  databaseUrl: string,
  key: string,
  actionInput: string,
  actor?: Principal,
  comment = "",
  options?: { dueAt?: Date },
): Promise<WorkflowRecord> {
  const action = parseAction(actionInput);
  if (action !== "submit") {
    return recordReviewDecision(databaseUrl, key, action, actor, comment);
  }

  const artifact = await getArtifact(databaseUrl, key, actor);
  const current = artifact.currentVersion;
  if (current.status === "SUPERSEDED") {
    throw new ConflictError(`Cannot transition superseded version of ${artifact.key}`);
  }
  const fromState = current.workflowState;
  const graph = WORKFLOW_GRAPH[action];
  if (!graph.from.includes(fromState)) {
    throw new ConflictError(`Cannot ${action} from ${fromState}. Allowed from: ${graph.from.join(", ")}.`);
  }

  const policy = await loadPolicy(databaseUrl, artifact.type, action);
  const principal = await requirePermission(databaseUrl, actor, policy.requiredPermission as PermissionKey);
  if (policy.requiredRole && !principal.roles.includes("administrator") && !principal.roles.includes(policy.requiredRole)) {
    throw new AuthorizationError(`Missing role for ${action}: ${policy.requiredRole}`);
  }

  const toState = graph.to;
  await withDatabase(databaseUrl, async ({ db }) => {
    await db.update(artifactVersions).set({ workflowState: toState }).where(eq(artifactVersions.id, current.id));
    await db.insert(workflowTransitions).values({
      id: randomUUID(),
      artifactVersionId: current.id,
      fromState,
      toState,
      action,
      actorId: principal.id,
      comment: comment.trim(),
      createdAt: new Date(),
    });
  });
  await openReviewForVersion(databaseUrl, artifact.key, principal, options?.dueAt);
  return getWorkflow(databaseUrl, artifact.key, principal);
}

async function loadPolicy(
  databaseUrl: string,
  artifactType: string,
  action: WorkflowAction,
): Promise<WorkflowPolicyRecord> {
  return withDatabase(databaseUrl, async ({ db }) => {
    const specific = (
      await db
        .select()
        .from(workflowPolicies)
        .where(eq(workflowPolicies.artifactType, artifactType))
    ).find((row) => row.action === action);
    const fallback = (
      await db.select().from(workflowPolicies).where(eq(workflowPolicies.artifactType, "*"))
    ).find((row) => row.action === action);
    const row = specific ?? fallback;
    if (!row) {
      throw new ConflictError(`No workflow policy for ${artifactType} ${action}`);
    }
    return {
      artifactType: row.artifactType,
      action: row.action as WorkflowAction,
      requiredPermission: row.requiredPermission,
      requiredRole: row.requiredRole,
    };
  });
}

function parseAction(value: string): WorkflowAction {
  const action = value.trim().toLowerCase().replaceAll("-", "_");
  if (!WORKFLOW_ACTIONS.includes(action as WorkflowAction)) {
    throw new ValidationError(`Unknown workflow action: ${value}`);
  }
  return action as WorkflowAction;
}
