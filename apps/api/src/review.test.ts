import { randomUUID } from "node:crypto";
import { createSettings, clearSettingsCache } from "@setwin/config";
import { applyMigrations } from "@setwin/database";
import { seedIdentityCatalog } from "@setwin/auth";
import { seedWorkflowPolicies } from "@setwin/twin";
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

describe("review api", () => {
  it("rejects unauthenticated review decisions", async (context) => {
    if (!(await postgresListening())) {
      context.skip();
    }
    process.env.SETWIN_DATABASE_URL = "postgresql://setwin:setwin@127.0.0.1:5432/setwin";
    clearSettingsCache();
    const settings = createSettings();
    await applyMigrations(settings.databaseUrl);
    await seedIdentityCatalog(settings.databaseUrl);
    await seedWorkflowPolicies(settings.databaseUrl);
    const app = createApp();
    const response = await app.inject({
      method: "POST",
      url: `/artifacts/REQ-${randomUUID().slice(0, 3)}/review/decide`,
      headers: { "content-type": "application/json" },
      payload: { decision: "APPROVE" },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
    delete process.env.SETWIN_DATABASE_URL;
    clearSettingsCache();
  });
});
