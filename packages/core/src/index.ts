import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { VERSION, createSettings, getSettings, type Settings } from "@setwin/config";
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
      message: "Local directories created. Database is unreachable; migrations were not applied.",
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
