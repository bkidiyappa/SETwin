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

export function explainUnreachableDatabase(databaseUrl: string, detail: string): string {
  const databaseName = databaseNameFromUrl(databaseUrl);
  return [
    "SETwin init stopped. PostgreSQL is not ready, so no tables were created.",
    "",
    `SETWIN_DATABASE_URL: ${redactDatabaseUrl(databaseUrl)}`,
    `Check result: ${detail}`,
    `What that means: ${describeDatabaseFailure(detail)}`,
    "",
    `init creates tables inside the database named "${databaseName}". Create that database before init. init leaves PostgreSQL installation, startup, and CREATE DATABASE to you.`,
    "",
    "Docker is optional. When .env points SETWIN_DATABASE_URL at a PostgreSQL you already run, start that server and skip docker compose.",
    "The sample server in this repository is for a machine that has no PostgreSQL yet:",
    "  docker compose up -d",
    "  docker compose ps",
    "Wait until the postgres service is healthy. docker compose up -d returns before PostgreSQL accepts connections, and init fails the same way if you run it during that wait.",
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
    return "Nothing accepted a connection on that host and port. PostgreSQL is stopped, the URL host or port is wrong, or the sample container is not publishing port 5432 yet.";
  }
  if (text.includes("does not exist")) {
    return "PostgreSQL answered, and the database named in the URL is missing. Create it, then run init again. The Compose sample creates a database named setwin.";
  }
  if (text.includes("authentication") || text.includes("password")) {
    return "PostgreSQL answered, and the user or password in SETWIN_DATABASE_URL was rejected.";
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
