import { boolean, doublePrecision, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const setwinMeta = pgTable("setwin_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey(),
  key: text("key").notNull().unique(),
  description: text("description").notNull().default(""),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.userId] })],
);

export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const artifactKeyCounters = pgTable("artifact_key_counters", {
  prefix: text("prefix").primaryKey(),
  lastValue: integer("last_value").notNull(),
});

export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  key: text("key").notNull().unique(),
  type: text("type").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  currentVersionId: uuid("current_version_id"),
});

export const artifactVersions = pgTable(
  "artifact_versions",
  {
    id: uuid("id").primaryKey(),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    workflowState: text("workflow_state").notNull().default("DRAFT"),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    provenanceSource: text("provenance_source").notNull(),
    provenanceAuthority: text("provenance_authority").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    supersededBy: uuid("superseded_by"),
  },
  (table) => [unique("artifact_versions_artifact_id_version").on(table.artifactId, table.version)],
);

export const artifactRelationships = pgTable(
  "artifact_relationships",
  {
    id: uuid("id").primaryKey(),
    fromArtifactId: uuid("from_artifact_id")
      .notNull()
      .references(() => artifacts.id),
    toArtifactId: uuid("to_artifact_id")
      .notNull()
      .references(() => artifacts.id),
    type: text("type").notNull(),
    source: text("source").notNull(),
    confidence: doublePrecision("confidence"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }),
  },
  (table) => [unique("artifact_relationships_from_to_type").on(table.fromArtifactId, table.toArtifactId, table.type)],
);

export const gherkinFeatures = pgTable("gherkin_features", {
  id: uuid("id").primaryKey(),
  artifactVersionId: uuid("artifact_version_id")
    .notNull()
    .unique()
    .references(() => artifactVersions.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  language: text("language").notNull().default("en"),
});

export const gherkinScenarios = pgTable("gherkin_scenarios", {
  id: uuid("id").primaryKey(),
  featureId: uuid("feature_id")
    .notNull()
    .references(() => gherkinFeatures.id),
  keyword: text("keyword").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const gherkinSteps = pgTable("gherkin_steps", {
  id: uuid("id").primaryKey(),
  scenarioId: uuid("scenario_id")
    .notNull()
    .references(() => gherkinScenarios.id),
  keyword: text("keyword").notNull(),
  text: text("text").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const workflowPolicies = pgTable(
  "workflow_policies",
  {
    id: uuid("id").primaryKey(),
    artifactType: text("artifact_type").notNull(),
    action: text("action").notNull(),
    requiredPermission: text("required_permission").notNull(),
    requiredRole: text("required_role"),
  },
  (table) => [unique("workflow_policies_type_action").on(table.artifactType, table.action)],
);

export const workflowTransitions = pgTable("workflow_transitions", {
  id: uuid("id").primaryKey(),
  artifactVersionId: uuid("artifact_version_id")
    .notNull()
    .references(() => artifactVersions.id),
  fromState: text("from_state").notNull(),
  toState: text("to_state").notNull(),
  action: text("action").notNull(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id),
  comment: text("comment").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const approvalPolicies = pgTable(
  "approval_policies",
  {
    id: uuid("id").primaryKey(),
    artifactType: text("artifact_type").notNull(),
    requiredRole: text("required_role").notNull(),
    sortOrder: integer("sort_order").notNull(),
    mode: text("mode").notNull(),
  },
  (table) => [unique("approval_policies_type_role").on(table.artifactType, table.requiredRole)],
);

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey(),
  artifactVersionId: uuid("artifact_version_id")
    .notNull()
    .unique()
    .references(() => artifactVersions.id),
  status: text("status").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const reviewFindings = pgTable("review_findings", {
  id: uuid("id").primaryKey(),
  reviewId: uuid("review_id")
    .notNull()
    .references(() => reviews.id),
  severity: text("severity").notNull(),
  summary: text("summary").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const approvalRequests = pgTable("approval_requests", {
  id: uuid("id").primaryKey(),
  reviewId: uuid("review_id")
    .notNull()
    .references(() => reviews.id),
  requiredRole: text("required_role").notNull(),
  assigneeUserId: uuid("assignee_user_id").references(() => users.id),
  status: text("status").notNull(),
  sortOrder: integer("sort_order").notNull(),
  delegatedFromUserId: uuid("delegated_from_user_id").references(() => users.id),
  escalatedFromRole: text("escalated_from_role"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const approvalDecisions = pgTable("approval_decisions", {
  id: uuid("id").primaryKey(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => approvalRequests.id),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id),
  decision: text("decision").notNull(),
  comment: text("comment").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey(),
  sequence: integer("sequence").notNull().unique(),
  correlationId: text("correlation_id").notNull(),
  action: text("action").notNull(),
  actorId: uuid("actor_id").references(() => users.id),
  actorUsername: text("actor_username").notNull().default(""),
  actorRoles: text("actor_roles").notNull().default(""),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  entityKey: text("entity_key").notNull().default(""),
  version: integer("version"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  previousHash: text("previous_hash").notNull(),
  eventHash: text("event_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const aiActions = pgTable("ai_actions", {
  id: uuid("id").primaryKey(),
  correlationId: text("correlation_id").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  task: text("task").notNull(),
  prompt: text("prompt").notNull(),
  response: text("response").notNull().default(""),
  status: text("status").notNull(),
  error: text("error").notNull().default(""),
  actorId: uuid("actor_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const codeRepositories = pgTable("code_repositories", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  path: text("path").notNull(),
  remoteUrl: text("remote_url").notNull().default(""),
  defaultBranch: text("default_branch").notNull().default("main"),
  lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const codeSymbols = pgTable("code_symbols", {
  id: uuid("id").primaryKey(),
  repositoryId: uuid("repository_id")
    .notNull()
    .references(() => codeRepositories.id),
  filePath: text("file_path").notNull(),
  language: text("language").notNull(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  startLine: integer("start_line").notNull(),
  endLine: integer("end_line").notNull(),
  signature: text("signature").notNull().default(""),
});

export const codeEdges = pgTable("code_edges", {
  id: uuid("id").primaryKey(),
  repositoryId: uuid("repository_id")
    .notNull()
    .references(() => codeRepositories.id),
  fromSymbolId: uuid("from_symbol_id")
    .notNull()
    .references(() => codeSymbols.id),
  toSymbolId: uuid("to_symbol_id")
    .notNull()
    .references(() => codeSymbols.id),
  edgeType: text("edge_type").notNull(),
});

export const changeAnalyses = pgTable("change_analyses", {
  id: uuid("id").primaryKey(),
  repositoryId: uuid("repository_id")
    .notNull()
    .references(() => codeRepositories.id),
  baseRef: text("base_ref").notNull(),
  headRef: text("head_ref").notNull(),
  diffSummary: text("diff_summary").notNull(),
  impactedSymbols: text("impacted_symbols").notNull().default("[]"),
  regressionScope: text("regression_scope").notNull().default("[]"),
  riskScore: doublePrecision("risk_score").notNull(),
  riskLevel: text("risk_level").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const contextChunks = pgTable("context_chunks", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  content: text("content").notNull(),
  embeddingJson: text("embedding_json").notNull().default("[]"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const agentProposals = pgTable("agent_proposals", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  role: text("role").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  artifactType: text("artifact_type").notNull(),
  artifactKey: text("artifact_key"),
  status: text("status").notNull().default("DRAFT"),
  aiActionId: uuid("ai_action_id").references(() => aiActions.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const codingAgentRuns = pgTable("coding_agent_runs", {
  id: uuid("id").primaryKey(),
  agent: text("agent").notNull(),
  prompt: text("prompt").notNull(),
  workspacePath: text("workspace_path").notNull().default(""),
  status: text("status").notNull(),
  output: text("output").notNull().default(""),
  error: text("error").notNull().default(""),
  actorId: uuid("actor_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const testRuns = pgTable("test_runs", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  adapter: text("adapter").notNull(),
  suite: text("suite").notNull().default(""),
  status: text("status").notNull(),
  summaryJson: text("summary_json").notNull().default("{}"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
});

export const testResults = pgTable("test_results", {
  id: uuid("id").primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => testRuns.id),
  name: text("name").notNull(),
  status: text("status").notNull(),
  durationMs: integer("duration_ms").notNull().default(0),
  message: text("message").notNull().default(""),
});

export const engineeringEvents = pgTable("engineering_events", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id").references(() => projects.id),
  category: text("category").notNull(),
  name: text("name").notNull(),
  value: doublePrecision("value"),
  payloadJson: text("payload_json").notNull().default("{}"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const integrationConnections = pgTable("integration_connections", {
  id: uuid("id").primaryKey(),
  provider: text("provider").notNull().unique(),
  baseUrl: text("base_url").notNull().default(""),
  configured: boolean("configured").notNull().default(false),
  status: text("status").notNull().default("unconfigured"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
