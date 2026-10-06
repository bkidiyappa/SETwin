import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clearSettingsCache } from "@setwin/config";
import { createApp } from "./app.ts";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  clearSettingsCache();
});

describe("api", () => {
  it("reports the database as down without leaking the connection string", async () => {
    process.env.SETWIN_DATABASE_URL = "postgresql://setwin:super-secret@127.0.0.1:1/setwin";
    clearSettingsCache();
    const app = createApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: "down", name: "SETwin", databaseReachable: false });
    expect(JSON.stringify(response.json())).not.toContain("super-secret");
    expect(response.headers["x-correlation-id"]).toBeTruthy();
    await app.close();
    delete process.env.SETWIN_DATABASE_URL;
    clearSettingsCache();
  });

  it("requires an administrator for /status", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "setwin-api-"));
    process.env.SETWIN_DATABASE_URL = "postgresql://setwin:super-secret@127.0.0.1:1/setwin";
    process.env.SETWIN_DATA_DIR = path.join(root, "data");
    process.env.SETWIN_WORKSPACE_DIR = path.join(root, "workspace");
    clearSettingsCache();
    const app = createApp();
    const response = await app.inject({ method: "GET", url: "/status" });
    expect(response.statusCode).toBe(401);
    expect(JSON.stringify(response.json())).not.toContain("super-secret");
    await app.close();
    await rm(root, { recursive: true, force: true });
    delete process.env.SETWIN_DATABASE_URL;
    delete process.env.SETWIN_DATA_DIR;
    delete process.env.SETWIN_WORKSPACE_DIR;
    clearSettingsCache();
  });
});
