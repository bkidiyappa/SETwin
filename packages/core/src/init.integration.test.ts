import { createSettings } from "@setwin/config";
import { initialize } from "@setwin/core";
import { listMeta } from "@setwin/database";
import net from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

function postgresListening(host = "127.0.0.1", port = 5432): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(200);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

describe("postgres init", () => {
  it("applies migrations and records metadata", async (context) => {
    if (!(await postgresListening())) {
      context.skip();
    }
    const root = await mkdtemp(path.join(os.tmpdir(), "setwin-pg-"));
    const settings = createSettings({
      env: "test",
      databaseUrl: "postgresql://setwin:setwin@127.0.0.1:5432/setwin",
      dataDir: path.join(root, "data"),
      workspaceDir: path.join(root, "workspace"),
    });
    const result = await initialize(settings);
    expect(result.databaseReachable).toBe(true);
    expect(result.migrationsApplied).toBe(true);
    expect(result.initializedAt).toBeTruthy();
    const meta = await listMeta(settings.databaseUrl);
    expect(meta.initialized_at).toBeTruthy();
    expect(meta.version).toBeTruthy();
    await rm(root, { recursive: true, force: true });
  });
});
