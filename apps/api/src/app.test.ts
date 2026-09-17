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
  it("returns health with a correlation id", async () => {
    const app = createApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", name: "SETwin" });
    expect(response.headers["x-correlation-id"]).toBeTruthy();
    await app.close();
  });

  it("hides secrets on /status", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "setwin-api-"));
    process.env.SETWIN_DATABASE_URL = "postgresql://setwin:super-secret@127.0.0.1:1/setwin";
    process.env.SETWIN_DATA_DIR = path.join(root, "data");
    process.env.SETWIN_WORKSPACE_DIR = path.join(root, "workspace");
    clearSettingsCache();
    const app = createApp();
    const response = await app.inject({ method: "GET", url: "/status" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.databaseUrl).toBe("postgresql://setwin:***@127.0.0.1:1/setwin");
    expect(JSON.stringify(body)).not.toContain("super-secret");
    expect(body.databaseReachable).toBe(false);
    await app.close();
    await rm(root, { recursive: true, force: true });
    delete process.env.SETWIN_DATABASE_URL;
    delete process.env.SETWIN_DATA_DIR;
    delete process.env.SETWIN_WORKSPACE_DIR;
    clearSettingsCache();
  });
});
