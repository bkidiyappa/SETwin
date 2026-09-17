import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import pino, { type Logger } from "pino";
import { z } from "zod";

export const VERSION = "0.1.0";

const settingsSchema = z.object({
  env: z.string().default("development"),
  logLevel: z.string().default("INFO"),
  databaseUrl: z.string().default("postgresql://setwin:setwin@127.0.0.1:5432/setwin"),
  apiHost: z.string().default("127.0.0.1"),
  apiPort: z.coerce.number().default(8000),
  dataDir: z.string().default("data"),
  workspaceDir: z.string().default("workspace"),
});

export type Settings = z.infer<typeof settingsSchema> & {
  databaseUrlRedacted: string;
};

const correlationStore = new AsyncLocalStorage<string>();
let cachedSettings: Settings | undefined;
let logger: Logger | undefined;

export function findProjectRoot(start = process.cwd()): string {
  let dir = start;
  while (true) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml")) || existsSync(path.join(dir, "pyproject.toml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return start;
    }
    dir = parent;
  }
}

export function loadEnvFile(): void {
  const envPath = path.join(findProjectRoot(), ".env");
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
  }
}

export function normalizeDatabaseUrl(url: string): string {
  return url.replace(/^postgresql\+[^:]+:\/\//, "postgresql://");
}

export function redactDatabaseUrl(url: string): string {
  const normalized = normalizeDatabaseUrl(url);
  const at = normalized.lastIndexOf("@");
  if (at === -1) {
    return normalized;
  }
  const userinfo = normalized.slice(0, at);
  const hostinfo = normalized.slice(at + 1);
  const schemeIdx = userinfo.indexOf("://");
  const scheme = schemeIdx >= 0 ? userinfo.slice(0, schemeIdx + 3) : "";
  const creds = schemeIdx >= 0 ? userinfo.slice(schemeIdx + 3) : userinfo;
  if (!creds.includes(":")) {
    return normalized;
  }
  const username = creds.slice(0, creds.indexOf(":"));
  return `${scheme}${username}:***@${hostinfo}`;
}

export function createSettings(overrides: Partial<{
  env: string;
  logLevel: string;
  databaseUrl: string;
  apiHost: string;
  apiPort: number;
  dataDir: string;
  workspaceDir: string;
}> = {}): Settings {
  const parsed = settingsSchema.parse({
    env: overrides.env ?? process.env.SETWIN_ENV ?? "development",
    logLevel: (overrides.logLevel ?? process.env.SETWIN_LOG_LEVEL ?? "INFO").toUpperCase(),
    databaseUrl:
      overrides.databaseUrl ??
      process.env.SETWIN_DATABASE_URL ??
      "postgresql://setwin:setwin@127.0.0.1:5432/setwin",
    apiHost: overrides.apiHost ?? process.env.SETWIN_API_HOST ?? "127.0.0.1",
    apiPort: overrides.apiPort ?? process.env.SETWIN_API_PORT ?? 8000,
    dataDir: overrides.dataDir ?? process.env.SETWIN_DATA_DIR ?? "data",
    workspaceDir: overrides.workspaceDir ?? process.env.SETWIN_WORKSPACE_DIR ?? "workspace",
  });
  const databaseUrl = normalizeDatabaseUrl(parsed.databaseUrl);
  return {
    ...parsed,
    logLevel: parsed.logLevel.toUpperCase(),
    databaseUrl,
    databaseUrlRedacted: redactDatabaseUrl(databaseUrl),
  };
}

export function getSettings(): Settings {
  if (!cachedSettings) {
    loadEnvFile();
    cachedSettings = createSettings();
  }
  return cachedSettings;
}

export function clearSettingsCache(): void {
  cachedSettings = undefined;
}

export function setCorrelationId(correlationId: string): void {
  correlationStore.enterWith(correlationId);
}

export function getCorrelationId(): string {
  return correlationStore.getStore() ?? "-";
}

export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return correlationStore.run(correlationId, fn);
}

export function setupLogging(level = "INFO"): Logger {
  logger = pino(
    {
      name: "setwin",
      level: level.toLowerCase(),
      timestamp: pino.stdTimeFunctions.isoTime,
      mixin() {
        return { correlation_id: getCorrelationId() };
      },
      formatters: {
        level(label) {
          return { level: label.toUpperCase() };
        },
      },
    },
    pino.destination({ dest: 2, sync: true }),
  );
  return logger;
}

export function getLogger(): Logger {
  return logger ?? setupLogging(getSettings().logLevel);
}
