import { redactDatabaseUrl } from "@setwin/config";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import net from "node:net";
import postgres, { type Sql } from "postgres";
import { setwinMeta } from "./schema.ts";
import {
  approvalDecisions,
  approvalPolicies,
  approvalRequests,
  artifactKeyCounters,
  artifactRelationships,
  artifactVersions,
  artifacts,
  authSessions,
  gherkinFeatures,
  gherkinScenarios,
  gherkinSteps,
  permissions,
  projects,
  reviewFindings,
  reviews,
  rolePermissions,
  roles,
  teamMembers,
  teams,
  userRoles,
  users,
  workflowPolicies,
  workflowTransitions,
} from "./schema.ts";

const TCP_PROBE_MS = 400;
const CONNECT_TIMEOUT_SECONDS = 2;

export type DatabaseHealth = {
  reachable: boolean;
  detail: string;
};

export type DatabaseClient = {
  db: PostgresJsDatabase;
  sql: Sql;
  close: () => Promise<void>;
};

export function createDatabaseClient(databaseUrl: string): DatabaseClient {
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    idle_timeout: 5,
    onnotice: () => undefined,
  });
  const db = drizzle(sql);
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 1 });
    },
  };
}

export async function checkDatabase(databaseUrl: string): Promise<DatabaseHealth> {
  const target = databaseHostPort(databaseUrl);
  if (target && !(await tcpReachable(target.host, target.port))) {
    return { reachable: false, detail: `not listening on ${target.host}:${target.port}` };
  }
  const client = createDatabaseClient(databaseUrl);
  try {
    await client.sql`SELECT 1`;
    return { reachable: true, detail: "reachable" };
  } catch (error) {
    return { reachable: false, detail: safeError(error, databaseUrl) };
  } finally {
    await client.close();
  }
}

const MIGRATION_LOCK_ID = 8_747_201;

export async function applyMigrations(databaseUrl: string): Promise<void> {
  const client = createDatabaseClient(databaseUrl);
  try {
    await client.sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`;
    await client.sql`
      CREATE TABLE IF NOT EXISTS setwin_meta (
        key text PRIMARY KEY,
        value text NOT NULL,
        updated_at timestamptz NOT NULL
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        username text NOT NULL UNIQUE,
        display_name text NOT NULL,
        password_hash text NOT NULL,
        password_salt text NOT NULL,
        disabled boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS roles (
        id uuid PRIMARY KEY,
        name text NOT NULL UNIQUE,
        description text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS permissions (
        id uuid PRIMARY KEY,
        key text NOT NULL UNIQUE,
        description text NOT NULL DEFAULT ''
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id uuid NOT NULL REFERENCES users(id),
        role_id uuid NOT NULL REFERENCES roles(id),
        PRIMARY KEY (user_id, role_id)
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id uuid NOT NULL REFERENCES roles(id),
        permission_id uuid NOT NULL REFERENCES permissions(id),
        PRIMARY KEY (role_id, permission_id)
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS teams (
        id uuid PRIMARY KEY,
        name text NOT NULL UNIQUE,
        description text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS team_members (
        team_id uuid NOT NULL REFERENCES teams(id),
        user_id uuid NOT NULL REFERENCES users(id),
        PRIMARY KEY (team_id, user_id)
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id),
        token_hash text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS projects (
        id uuid PRIMARY KEY,
        key text NOT NULL UNIQUE,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS artifact_key_counters (
        prefix text PRIMARY KEY,
        last_value integer NOT NULL
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS artifacts (
        id uuid PRIMARY KEY,
        project_id uuid NOT NULL REFERENCES projects(id),
        key text NOT NULL UNIQUE,
        type text NOT NULL,
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL,
        current_version_id uuid
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS artifact_versions (
        id uuid PRIMARY KEY,
        artifact_id uuid NOT NULL REFERENCES artifacts(id),
        version integer NOT NULL,
        status text NOT NULL,
        title text NOT NULL,
        content text NOT NULL DEFAULT '',
        provenance_source text NOT NULL,
        provenance_authority text NOT NULL,
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL,
        superseded_by uuid,
        UNIQUE (artifact_id, version)
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS artifact_relationships (
        id uuid PRIMARY KEY,
        from_artifact_id uuid NOT NULL REFERENCES artifacts(id),
        to_artifact_id uuid NOT NULL REFERENCES artifacts(id),
        type text NOT NULL,
        source text NOT NULL,
        confidence double precision,
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL,
        valid_from timestamptz NOT NULL,
        valid_to timestamptz,
        UNIQUE (from_artifact_id, to_artifact_id, type)
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS gherkin_features (
        id uuid PRIMARY KEY,
        artifact_version_id uuid NOT NULL UNIQUE REFERENCES artifact_versions(id),
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        language text NOT NULL DEFAULT 'en'
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS gherkin_scenarios (
        id uuid PRIMARY KEY,
        feature_id uuid NOT NULL REFERENCES gherkin_features(id),
        keyword text NOT NULL,
        name text NOT NULL,
        sort_order integer NOT NULL
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS gherkin_steps (
        id uuid PRIMARY KEY,
        scenario_id uuid NOT NULL REFERENCES gherkin_scenarios(id),
        keyword text NOT NULL,
        text text NOT NULL,
        sort_order integer NOT NULL
      )
    `;
    await client.sql`
      ALTER TABLE artifact_versions
      ADD COLUMN IF NOT EXISTS workflow_state text NOT NULL DEFAULT 'DRAFT'
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS workflow_policies (
        id uuid PRIMARY KEY,
        artifact_type text NOT NULL,
        action text NOT NULL,
        required_permission text NOT NULL,
        required_role text,
        UNIQUE (artifact_type, action)
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS workflow_transitions (
        id uuid PRIMARY KEY,
        artifact_version_id uuid NOT NULL REFERENCES artifact_versions(id),
        from_state text NOT NULL,
        to_state text NOT NULL,
        action text NOT NULL,
        actor_id uuid NOT NULL REFERENCES users(id),
        comment text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS approval_policies (
        id uuid PRIMARY KEY,
        artifact_type text NOT NULL,
        required_role text NOT NULL,
        sort_order integer NOT NULL,
        mode text NOT NULL,
        UNIQUE (artifact_type, required_role)
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS reviews (
        id uuid PRIMARY KEY,
        artifact_version_id uuid NOT NULL UNIQUE REFERENCES artifact_versions(id),
        status text NOT NULL,
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL,
        completed_at timestamptz
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS review_findings (
        id uuid PRIMARY KEY,
        review_id uuid NOT NULL REFERENCES reviews(id),
        severity text NOT NULL,
        summary text NOT NULL,
        resolved boolean NOT NULL DEFAULT false,
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS approval_requests (
        id uuid PRIMARY KEY,
        review_id uuid NOT NULL REFERENCES reviews(id),
        required_role text NOT NULL,
        assignee_user_id uuid REFERENCES users(id),
        status text NOT NULL,
        sort_order integer NOT NULL,
        delegated_from_user_id uuid REFERENCES users(id),
        escalated_from_role text,
        due_at timestamptz,
        decided_at timestamptz
      )
    `;
    await client.sql`
      CREATE TABLE IF NOT EXISTS approval_decisions (
        id uuid PRIMARY KEY,
        request_id uuid NOT NULL REFERENCES approval_requests(id),
        actor_id uuid NOT NULL REFERENCES users(id),
        decision text NOT NULL,
        comment text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL
      )
    `;
  } finally {
    try {
      await client.sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
    } finally {
      await client.close();
    }
  }
}

export async function withDatabase<T>(
  databaseUrl: string,
  fn: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = createDatabaseClient(databaseUrl);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

export async function readMeta(databaseUrl: string, key: string): Promise<string | undefined> {
  const client = createDatabaseClient(databaseUrl);
  try {
    const rows = await client.db.select().from(setwinMeta).where(eq(setwinMeta.key, key));
    return rows[0]?.value;
  } finally {
    await client.close();
  }
}

export async function listMeta(databaseUrl: string): Promise<Record<string, string>> {
  const client = createDatabaseClient(databaseUrl);
  try {
    const rows = await client.db.select().from(setwinMeta);
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  } finally {
    await client.close();
  }
}

export async function upsertMeta(databaseUrl: string, key: string, value: string): Promise<void> {
  const client = createDatabaseClient(databaseUrl);
  try {
    await client.db
      .insert(setwinMeta)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: setwinMeta.key,
        set: { value, updatedAt: new Date() },
      });
  } finally {
    await client.close();
  }
}

export function databaseHostPort(databaseUrl: string): { host: string; port: number } | undefined {
  try {
    const parsed = new URL(databaseUrl);
    if (!parsed.hostname) {
      return undefined;
    }
    return { host: parsed.hostname, port: parsed.port ? Number(parsed.port) : 5432 };
  } catch {
    return undefined;
  }
}

function tcpReachable(host: string, port: number, timeout = TCP_PROBE_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function safeError(error: unknown, databaseUrl: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const redacted = redactDatabaseUrl(databaseUrl);
  let sanitized = message.replaceAll(databaseUrl, redacted);
  try {
    const password = new URL(databaseUrl).password;
    if (password) {
      sanitized = sanitized.replaceAll(password, "***");
    }
  } catch {
    // URL parsing failed; the replacement above still applies.
  }
  return sanitized;
}

export {
  approvalDecisions,
  approvalPolicies,
  approvalRequests,
  artifactKeyCounters,
  artifactRelationships,
  artifactVersions,
  artifacts,
  authSessions,
  gherkinFeatures,
  gherkinScenarios,
  gherkinSteps,
  permissions,
  projects,
  reviewFindings,
  reviews,
  rolePermissions,
  roles,
  setwinMeta,
  teamMembers,
  teams,
  userRoles,
  users,
  workflowPolicies,
  workflowTransitions,
};
