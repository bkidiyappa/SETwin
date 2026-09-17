import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSettings } from "@setwin/config";
import { buildStatus, formatStatus, initialize } from "./index.ts";
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
    expect(result.message).toContain("Database is unreachable");
    await access(settings.dataDir);
    await access(settings.workspaceDir);
    await rm(root, { recursive: true, force: true });
  });
});
