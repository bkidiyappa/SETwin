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
