import { randomUUID } from "node:crypto";
import { createSettings, clearSettingsCache } from "@setwin/config";
import { applyMigrations } from "@setwin/database";
import { seedIdentityCatalog } from "@setwin/auth";
import { createApp } from "./app.ts";
import { afterEach, describe, expect, it } from "vitest";
import net from "node:net";

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

afterEach(() => {
  clearSettingsCache();
});

describe("identity api", () => {
  it("rejects unauthorized user creation after bootstrap", async (context) => {
    if (!(await postgresListening())) {
      context.skip();
    }
    process.env.SETWIN_DATABASE_URL = "postgresql://setwin:setwin@127.0.0.1:5432/setwin";
    clearSettingsCache();
    const settings = createSettings();
    await applyMigrations(settings.databaseUrl);
    await seedIdentityCatalog(settings.databaseUrl);

    const app = createApp();
    const suffix = randomUUID().slice(0, 8);
    const headers = { "content-type": "application/json" };
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers,
      payload: { username: "missing-user", password: "nope" },
    });
    expect(login.statusCode).toBe(401);

    const first = await app.inject({
      method: "POST",
      url: "/users",
      headers,
      payload: { username: `bootstrap_${suffix}`, password: "bootstrap-pass" },
    });
    if (first.statusCode === 200) {
      const second = await app.inject({
        method: "POST",
        url: "/users",
        headers,
        payload: { username: `dev_${suffix}`, password: "dev-pass", role: "developer" },
      });
      expect(second.statusCode).toBe(401);
    } else {
      expect([401, 403]).toContain(first.statusCode);
    }

    const me = await app.inject({ method: "GET", url: "/auth/me" });
    expect(me.statusCode).toBe(401);
    await app.close();
    delete process.env.SETWIN_DATABASE_URL;
    clearSettingsCache();
  });
});
