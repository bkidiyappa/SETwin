import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { VERSION, createSettings, getSettings, redactDatabaseUrl, type Settings } from "@setwin/config";
import {
  applyMigrations,
  checkDatabase,
  readMeta,
  upsertMeta,
  type DatabaseHealth,
} from "@setwin/database";
import { seedIdentityCatalog } from "@setwin/auth";
import { seedWorkflowPolicies } from "@setwin/twin";

export type StatusReport = {
  name: string;
  version: string;
  env: string;
  logLevel: string;
  apiHost: string;
  apiPort: number;
  dataDir: string;
  dataDirExists: boolean;
  workspaceDir: string;
  workspaceDirExists: boolean;
  databaseUrl: string;
  databaseReachable: boolean;
  databaseDetail: string;
  initialized: boolean;
};

export type InitResult = {
  dataDir: string;
  workspaceDir: string;
  databaseReachable: boolean;
  databaseDetail: string;
  migrationsApplied: boolean;
  initializedAt: string | null;
  alreadyInitialized: boolean;
  message: string;
};

export async function buildStatus(
  settings: Settings = getSettings(),
  health?: DatabaseHealth,
): Promise<StatusReport> {
  const resolvedHealth = health ?? (await checkDatabase(settings.databaseUrl));
  let initialized = false;
  if (resolvedHealth.reachable) {
    try {
      initialized = (await readMeta(settings.databaseUrl, "initialized_at")) !== undefined;
    } catch {
      initialized = false;
    }
  }

  return {
    name: "SETwin",
    version: VERSION,
    env: settings.env,
    logLevel: settings.logLevel,
    apiHost: settings.apiHost,
    apiPort: settings.apiPort,
    dataDir: settings.dataDir,
    dataDirExists: await exists(settings.dataDir),
    workspaceDir: settings.workspaceDir,
    workspaceDirExists: await exists(settings.workspaceDir),
    databaseUrl: settings.databaseUrlRedacted,
    databaseReachable: resolvedHealth.reachable,
    databaseDetail: resolvedHealth.detail,
    initialized,
  };
}

export function formatStatus(report: StatusReport): string {
  const dbHealth = report.databaseReachable
    ? "reachable"
    : `unreachable (${report.databaseDetail})`;
  return [
    `${report.name} ${report.version}`,
    "",
    `Environment:      ${report.env}`,
    `Log level:        ${report.logLevel}`,
    `API:              ${report.apiHost}:${report.apiPort}`,
    `Data directory:   ${report.dataDir} (${report.dataDirExists ? "exists" : "missing"})`,
    `Workspace:        ${report.workspaceDir} (${report.workspaceDirExists ? "exists" : "missing"})`,
    `Database:         ${report.databaseUrl}`,
    `Database health:  ${dbHealth}`,
    `Initialized:      ${report.initialized ? "yes" : "no"}`,
  ].join("\n");
}

export async function initialize(settings: Settings = getSettings()): Promise<InitResult> {
  const dataDir = path.resolve(settings.dataDir);
  const workspaceDir = path.resolve(settings.workspaceDir);
  await mkdir(dataDir, { recursive: true });
  await mkdir(workspaceDir, { recursive: true });

  const health = await checkDatabase(settings.databaseUrl);
  if (!health.reachable) {
    return {
      dataDir,
      workspaceDir,
      databaseReachable: false,
      databaseDetail: health.detail,
      migrationsApplied: false,
      initializedAt: null,
      alreadyInitialized: false,
      message: `PostgreSQL is not ready (${health.detail}). Tables were not created.`,
    };
  }

  await applyMigrations(settings.databaseUrl);
  await seedIdentityCatalog(settings.databaseUrl);
  await seedWorkflowPolicies(settings.databaseUrl);
  const existing = await readMeta(settings.databaseUrl, "initialized_at");
  const alreadyInitialized = existing !== undefined;
  const initializedAt = existing ?? new Date().toISOString();
  await upsertMeta(settings.databaseUrl, "initialized_at", initializedAt);
  await upsertMeta(settings.databaseUrl, "version", VERSION);

  return {
    dataDir,
    workspaceDir,
    databaseReachable: true,
    databaseDetail: "reachable",
    migrationsApplied: true,
    initializedAt,
    alreadyInitialized,
    message: alreadyInitialized ? "SETwin is already initialized." : "SETwin initialized.",
  };
}

export function explainUnreachableDatabase(
  databaseUrl: string,
  detail: string,
  configuredUrl?: string,
): string {
  const databaseName = databaseNameFromUrl(databaseUrl);
  const scheme = configuredUrl?.split("://")[0];
  const schemeNote =
    scheme && scheme !== "postgresql" && scheme !== "postgres"
      ? [
          `The value in .env starts with ${scheme}://.`,
          "psql does not accept that prefix. A successful psql command that used postgresql:// tested a different string.",
          `Change SETWIN_DATABASE_URL to ${redactDatabaseUrl(databaseUrl)} and pass that exact postgresql:// string to psql.`,
          "",
        ]
      : [];
  return [
    "SETwin init stopped. PostgreSQL is not ready, so no tables were created.",
    "",
    `SETWIN_DATABASE_URL: ${redactDatabaseUrl(databaseUrl)}`,
    ...schemeNote,
    `Check result: ${detail}`,
    `What that means: ${describeDatabaseFailure(detail)}`,
    "",
    `init creates tables inside the database named "${databaseName}". Create that database before init.`,
    "",
    "PostgreSQL installed on Linux (no Docker): the packages create a superuser named postgres and a database named postgres. They do not create user setwin or database setwin. The default URL expects both. Do not run docker compose.",
    "  sudo systemctl start postgresql",
    "  sudo -u postgres psql -c \"CREATE USER setwin WITH PASSWORD 'setwin';\"",
    "  sudo -u postgres psql -c \"CREATE DATABASE setwin OWNER setwin;\"",
    "  psql \"postgresql://setwin:setwin@127.0.0.1:5432/setwin\" -c \"SELECT 1\"",
    "SE Twin connects to 127.0.0.1 over TCP. In pg_hba.conf the 127.0.0.1/32 line must allow a password (scram-sha-256 or md5). Reload PostgreSQL after editing that file.",
    "docker compose is only for a machine where PostgreSQL is not installed. On a machine that already runs it, Compose fights for port 5432.",
    "",
    "Create .env before init. On Linux and macOS:",
    "  cp .env.example .env",
    "On Windows:",
    "  copy .env.example .env",
    "copy is a Windows command. On Linux that command fails, .env is never created, and init uses the default URL 127.0.0.1:5432/setwin.",
    "",
    'pnpm then prints "Command failed with exit code 1". That line only means init exited with status 1. The reason is the check result above.',
    "Run `pnpm setwin -- status` to repeat this check.",
  ].join("\n");
}

export function explainInitFailure(databaseUrl: string, error: unknown): string {
  const detail = redactDatabaseError(databaseUrl, error);
  const databaseName = databaseNameFromUrl(databaseUrl);
  const username = databaseUserFromUrl(databaseUrl);
  const lines = [
    "SETwin init failed while creating tables.",
    "",
    `SETWIN_DATABASE_URL: ${redactDatabaseUrl(databaseUrl)}`,
    `PostgreSQL said: ${detail}`,
    "",
    "A successful SELECT 1 only shows that this user can log in.",
  ];
  if (isSchemaCreateDenied(detail)) {
    lines.push(
      "This user cannot create tables in schema public. On PostgreSQL 15 and newer, that requires ownership of the database.",
      "Run these as the postgres superuser, then run init again:",
      `  sudo -u postgres psql -c "ALTER DATABASE ${databaseName} OWNER TO ${username};"`,
      `  sudo -u postgres psql -d ${databaseName} -c "GRANT ALL ON SCHEMA public TO ${username};"`,
    );
  }
  return lines.join("\n");
}

function redactDatabaseError(databaseUrl: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const redacted = redactDatabaseUrl(databaseUrl);
  let sanitized = message.replaceAll(databaseUrl, redacted);
  try {
    const password = new URL(databaseUrl).password;
    if (password) {
      sanitized = sanitized.replaceAll(decodeURIComponent(password), "***");
      sanitized = sanitized.replaceAll(password, "***");
    }
  } catch {
    // The URL could not be parsed. The replacement above still applies.
  }
  return sanitized || "(no message)";
}

function isSchemaCreateDenied(detail: string): boolean {
  const text = detail.toLowerCase();
  return text.includes("permission denied for schema") || text.includes("must be owner of");
}

function databaseUserFromUrl(databaseUrl: string): string {
  try {
    const username = decodeURIComponent(new URL(databaseUrl).username);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(username)) {
      return username;
    }
  } catch {
    // Fall through to a placeholder the operator can replace.
  }
  return "<user-in-SETWIN_DATABASE_URL>";
}

function databaseNameFromUrl(databaseUrl: string): string {
  try {
    const name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
    return name || "(missing database name)";
  } catch {
    return "(unreadable URL)";
  }
}

function describeDatabaseFailure(detail: string): string {
  const text = detail.toLowerCase();
  if (text.includes("not listening")) {
    return "Nothing accepted a connection on that host and port. On Linux start the service you installed: sudo systemctl start postgresql. Then confirm the port with ss -ltn. Put that host and port in SETWIN_DATABASE_URL.";
  }
  if (text.includes("role") && text.includes("does not exist")) {
    return "PostgreSQL answered, and the user in SETWIN_DATABASE_URL was never created. A Linux package install has the postgres superuser only. Create the user with sudo -u postgres psql, then run init again.";
  }
  if (text.includes("does not exist")) {
    return "PostgreSQL answered, and the database named in the URL is missing. Create it with sudo -u postgres psql -c \"CREATE DATABASE setwin OWNER setwin;\", then run init again.";
  }
  if (text.includes("authentication") || text.includes("password")) {
    return "PostgreSQL answered, and the user or password was rejected. On a Linux install the user setwin does not exist until you create it. Password login also requires a pg_hba.conf host line for 127.0.0.1/32.";
  }
  return "PostgreSQL answered with an error. The check result is that message with the password removed.";
}

export function formatInitResult(result: InitResult): string {
  const lines = [
    result.message,
    "",
    `Data directory:   ${result.dataDir}`,
    `Workspace:        ${result.workspaceDir}`,
    `Database health:  ${result.databaseReachable ? "reachable" : "unreachable"}`,
    `Migrations:       ${result.migrationsApplied ? "applied" : "not applied"}`,
  ];
  if (result.initializedAt) {
    lines.push(`Initialized at:   ${result.initializedAt}`);
  }
  if (!result.databaseReachable) {
    lines.push(`Database detail:  ${result.databaseDetail}`);
  }
  return lines.join("\n");
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export { VERSION, createSettings, getSettings };
