import { ARTIFACT_TYPES, type ApprovalMode, type ArtifactType } from "./types.ts";

export type ApprovalPolicySeed = {
  artifactType: ArtifactType;
  requiredRole: string;
  sortOrder: number;
  mode: ApprovalMode;
};

const TYPE_APPROVALS: Partial<Record<ArtifactType, { mode: ApprovalMode; roles: string[] }>> = {
  REQUIREMENT: { mode: "PARALLEL", roles: ["product_owner"] },
  STORY: { mode: "PARALLEL", roles: ["product_owner"] },
  EPIC: { mode: "PARALLEL", roles: ["product_owner"] },
  FEATURE: { mode: "PARALLEL", roles: ["product_owner"] },
  GHERKIN: { mode: "PARALLEL", roles: ["product_owner"] },
  DESIGN: { mode: "PARALLEL", roles: ["architect"] },
  DECISION: { mode: "PARALLEL", roles: ["architect"] },
  COMPONENT: { mode: "PARALLEL", roles: ["architect"] },
  ARCHITECTURE: { mode: "SEQUENTIAL", roles: ["architect", "engineering_manager"] },
  CODE: { mode: "PARALLEL", roles: ["engineering_manager", "security_reviewer"] },
  TEST: { mode: "PARALLEL", roles: ["qa_reviewer"] },
};

export const DEFAULT_APPROVAL_POLICIES: ApprovalPolicySeed[] = ARTIFACT_TYPES.flatMap((artifactType) => {
  const policy = TYPE_APPROVALS[artifactType];
  if (!policy) {
    return [];
  }
  return policy.roles.map((requiredRole, sortOrder) => ({
    artifactType,
    requiredRole,
    sortOrder,
    mode: policy.mode,
  }));
});
