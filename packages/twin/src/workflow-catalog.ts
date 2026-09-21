import type { PermissionKey } from "@setwin/auth";
import { ARTIFACT_TYPES, WORKFLOW_ACTIONS, type ArtifactType, type WorkflowAction, type WorkflowState } from "./types.ts";

export const WORKFLOW_GRAPH: Record<WorkflowAction, { from: WorkflowState[]; to: WorkflowState }> = {
  submit: { from: ["DRAFT"], to: "IN_REVIEW" },
  approve: { from: ["IN_REVIEW"], to: "APPROVED" },
  reject: { from: ["IN_REVIEW"], to: "REJECTED" },
  request_changes: { from: ["IN_REVIEW"], to: "CHANGES_REQUESTED" },
};

type PolicySeed = {
  artifactType: ArtifactType | "*";
  action: WorkflowAction;
  requiredPermission: PermissionKey;
  requiredRole: string | null;
};

const TYPE_APPROVERS: Partial<Record<ArtifactType, string>> = {
  REQUIREMENT: "product_owner",
  STORY: "product_owner",
  EPIC: "product_owner",
  FEATURE: "product_owner",
  GHERKIN: "product_owner",
  DESIGN: "architect",
  ARCHITECTURE: "architect",
  DECISION: "architect",
  COMPONENT: "architect",
  CODE: "engineering_manager",
  TEST: "qa_reviewer",
};

export const DEFAULT_WORKFLOW_POLICIES: PolicySeed[] = [
  { artifactType: "*", action: "submit", requiredPermission: "artifact:create", requiredRole: null },
  { artifactType: "*", action: "approve", requiredPermission: "artifact:approve", requiredRole: null },
  { artifactType: "*", action: "reject", requiredPermission: "artifact:reject", requiredRole: null },
  {
    artifactType: "*",
    action: "request_changes",
    requiredPermission: "artifact:request_changes",
    requiredRole: null,
  },
  ...ARTIFACT_TYPES.flatMap((artifactType) => {
    const role = TYPE_APPROVERS[artifactType];
    if (!role) {
      return [];
    }
    return [
      { artifactType, action: "approve" as const, requiredPermission: "artifact:approve" as const, requiredRole: role },
      { artifactType, action: "reject" as const, requiredPermission: "artifact:reject" as const, requiredRole: role },
      {
        artifactType,
        action: "request_changes" as const,
        requiredPermission: "artifact:request_changes" as const,
        requiredRole: role,
      },
    ];
  }),
];

export function allowedActionsFor(state: WorkflowState): WorkflowAction[] {
  return WORKFLOW_ACTIONS.filter((action) => WORKFLOW_GRAPH[action].from.includes(state));
}
