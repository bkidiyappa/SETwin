import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSettings } from "@setwin/config";
import { buildStatus, explainInitFailure, explainUnreachableDatabase, formatStatus, initialize } from "./index.ts";
import { describe, expect, it } from "vitest";

describe("status", () => {
  it("does not expose the database password", async () => {
    const settings = createSettings({
      env: "test",
      databaseUrl: "postgresql://setwin:super-secret@127.0.0.1:5432/setwin",
      dataDir: path.join(os.tmpdir(), "setwin-missing-data"),
      workspaceDir: path.join(os.tmpdir(), "setwin-missing-workspace"),
    });
    const report = await buildStatus(settings, {
      reachable: false,
      detail: "connection refused",
    });
    expect(report.databaseUrl).toBe("postgresql://setwin:***@127.0.0.1:5432/setwin");
    expect(report.databaseReachable).toBe(false);
    expect(report.initialized).toBe(false);
    expect(formatStatus(report)).not.toContain("super-secret");
  });
});

describe("initialize", () => {
  it("creates directories when the database is down", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "setwin-init-"));
    const settings = createSettings({
      databaseUrl: "postgresql://setwin:super-secret@127.0.0.1:1/setwin",
      dataDir: path.join(root, "data"),
      workspaceDir: path.join(root, "workspace"),
    });
    const result = await initialize(settings);
    expect(result.databaseReachable).toBe(false);
    expect(result.message).toContain("PostgreSQL is not ready");
    expect(result.databaseDetail).toContain("not listening");
    const explanation = explainUnreachableDatabase(settings.databaseUrl, result.databaseDetail);
    expect(explanation).toContain("Command failed with exit code 1");
    expect(explanation).toContain("cp .env.example .env");
    expect(explanation).toContain('database named "setwin"');
    expect(explanation).toContain("CREATE USER setwin");
    expect(explanation).not.toContain("super-secret");
    expect(explainUnreachableDatabase(settings.databaseUrl, 'database "setwin" does not exist')).toContain(
      "database named in the URL is missing",
    );
    expect(
      explainUnreachableDatabase(
        settings.databaseUrl,
        "not listening on 127.0.0.1:5432",
        "postgresql+psycopg://setwin:super-secret@127.0.0.1:5432/setwin",
      ),
    ).toContain("postgresql+psycopg://");
    const denied = explainInitFailure(
      settings.databaseUrl,
      new Error('permission denied for schema public'),
    );
    expect(denied).toContain("ALTER DATABASE setwin OWNER TO setwin");
    expect(denied).toContain("GRANT ALL ON SCHEMA public TO setwin");
    expect(denied).not.toContain("super-secret");
    await access(settings.dataDir);
    await access(settings.workspaceDir);
    await rm(root, { recursive: true, force: true });
  });
});
