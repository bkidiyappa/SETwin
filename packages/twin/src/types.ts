export const ARTIFACT_TYPES = [
  "REQUIREMENT",
  "EPIC",
  "FEATURE",
  "DESIGN",
  "ARCHITECTURE",
  "DECISION",
  "CODE",
  "TEST",
  "COMPONENT",
  "GHERKIN",
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_PREFIX: Record<ArtifactType, string> = {
  REQUIREMENT: "REQ",
  EPIC: "EPC",
  FEATURE: "FEA",
  DESIGN: "DES",
  ARCHITECTURE: "ARC",
  DECISION: "DEC",
  CODE: "COD",
  TEST: "TST",
  COMPONENT: "CMP",
  GHERKIN: "GHK",
};

export const VERSION_STATUSES = ["DRAFT", "SUPERSEDED", "APPROVED"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const WORKFLOW_STATES = ["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED"] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const WORKFLOW_ACTIONS = ["submit", "approve", "reject", "request_changes"] as const;
export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

export const PROVENANCE_SOURCES = [
  "HUMAN_AUTHORED",
  "SETWIN",
  "IMPORTED",
  "SYNCHRONIZED",
  "AI_INFERRED",
  "EXTERNAL",
] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

export const PROVENANCE_AUTHORITIES = ["SETWIN", "EXTERNAL"] as const;
export type ProvenanceAuthority = (typeof PROVENANCE_AUTHORITIES)[number];

export const RELATIONSHIP_TYPES = [
  "CONTAINS",
  "DERIVED_FROM",
  "IMPLEMENTS",
  "SATISFIES",
  "DESIGNED_BY",
  "DEPENDS_ON",
  "CALLS",
  "IMPORTS",
  "EXPOSES",
  "CONSUMES",
  "TESTED_BY",
  "VALIDATES",
  "AFFECTS",
  "FIXES",
  "CAUSED_BY",
  "INTRODUCED_IN",
  "CHANGED_IN",
  "SUPERSEDES",
  "REVIEWED_BY",
  "APPROVED_BY",
  "DEPLOYED_TO",
  "RELEASED_IN",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_SOURCES = ["HUMAN", "STATIC_ANALYSIS", "AI_INFERRED"] as const;
export type RelationshipSource = (typeof RELATIONSHIP_SOURCES)[number];

export type ProjectRecord = {
  id: string;
  key: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: Date;
};

export type Provenance = {
  source: ProvenanceSource;
  authority: ProvenanceAuthority;
  createdBy: string;
  createdAt: Date;
};

export type ArtifactVersionRecord = {
  id: string;
  artifactKey: string;
  version: number;
  status: VersionStatus;
  workflowState: WorkflowState;
  title: string;
  content: string;
  provenance: Provenance;
  supersededByVersion: number | null;
};

export type ArtifactRecord = {
  id: string;
  key: string;
  type: ArtifactType;
  projectKey: string;
  createdBy: string;
  createdAt: Date;
  currentVersion: ArtifactVersionRecord;
  versions: ArtifactVersionRecord[];
};

export type RelationshipRecord = {
  id: string;
  type: RelationshipType;
  source: RelationshipSource;
  confidence: number | null;
  fromKey: string;
  toKey: string;
  createdBy: string;
  createdAt: Date;
};

export type ParsedGherkinStep = {
  keyword: string;
  text: string;
  index: number;
};

export type ParsedGherkinScenario = {
  keyword: string;
  name: string;
  index: number;
  steps: ParsedGherkinStep[];
};

export type ParsedGherkinFeature = {
  name: string;
  description: string;
  language: string;
  scenarios: ParsedGherkinScenario[];
};

export type GherkinRecord = {
  artifact: ArtifactRecord;
  feature: ParsedGherkinFeature;
  validates: string[];
};

export type WorkflowPolicyRecord = {
  artifactType: string;
  action: WorkflowAction;
  requiredPermission: string;
  requiredRole: string | null;
};

export type WorkflowHistoryRecord = {
  fromState: WorkflowState;
  toState: WorkflowState;
  action: WorkflowAction;
  actorId: string;
  comment: string;
  createdAt: Date;
};

export type WorkflowRecord = {
  artifact: ArtifactRecord;
  state: WorkflowState;
  allowedActions: WorkflowAction[];
  history: WorkflowHistoryRecord[];
  review: ReviewRecord | null;
};

export const APPROVAL_MODES = ["PARALLEL", "SEQUENTIAL"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export const REVIEW_STATUSES = ["OPEN", "COMPLETED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const FINDING_SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const APPROVAL_REQUEST_STATUSES = [
  "PENDING",
  "BLOCKED",
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
] as const;
export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];

export const REVIEW_DECISIONS = ["APPROVE", "REJECT", "CHANGES_REQUESTED"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export type ApprovalPolicyRecord = {
  artifactType: string;
  requiredRole: string;
  sortOrder: number;
  mode: ApprovalMode;
};

export type ReviewFindingRecord = {
  id: string;
  severity: FindingSeverity;
  summary: string;
  resolved: boolean;
  createdBy: string;
  createdAt: Date;
};

export type ApprovalDecisionRecord = {
  id: string;
  actorId: string;
  actorUsername: string;
  decision: ReviewDecision;
  comment: string;
  createdAt: Date;
};

export type ApprovalRequestRecord = {
  id: string;
  requiredRole: string;
  assigneeUserId: string | null;
  assigneeUsername: string | null;
  status: ApprovalRequestStatus;
  sortOrder: number;
  delegatedFromUserId: string | null;
  delegatedFromUsername: string | null;
  escalatedFromRole: string | null;
  dueAt: Date | null;
  decidedAt: Date | null;
  decisions: ApprovalDecisionRecord[];
};

export type ReviewRecord = {
  id: string;
  artifactKey: string;
  version: number;
  workflowState: WorkflowState;
  status: ReviewStatus;
  findings: ReviewFindingRecord[];
  requests: ApprovalRequestRecord[];
};
