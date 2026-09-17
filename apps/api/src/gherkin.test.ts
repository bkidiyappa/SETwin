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

describe("gherkin api", () => {
  it("validates gherkin without auth and rejects unauthenticated create", async (context) => {
    if (!(await postgresListening())) {
      context.skip();
    }
    process.env.SETWIN_DATABASE_URL = "postgresql://setwin:setwin@127.0.0.1:5432/setwin";
    clearSettingsCache();
    const settings = createSettings();
    await applyMigrations(settings.databaseUrl);
    await seedIdentityCatalog(settings.databaseUrl);
    const app = createApp();
    const headers = { "content-type": "application/json" };

    const valid = await app.inject({
      method: "POST",
      url: "/gherkin/validate",
      headers,
      payload: {
        content: `Feature: Ping\n  Scenario: pong\n    Given a ping\n    Then a pong\n`,
      },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json().name).toBe("Ping");

    const invalid = await app.inject({
      method: "POST",
      url: "/gherkin/validate",
      headers,
      payload: { content: "nope" },
    });
    expect(invalid.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/gherkin",
      headers,
      payload: {
        project: `gherkin-${randomUUID().slice(0, 8)}`,
        content: "Feature: X\n  Scenario: y\n    Given z\n",
      },
    });
    expect(created.statusCode).toBe(401);
    await app.close();
    delete process.env.SETWIN_DATABASE_URL;
    clearSettingsCache();
  });
});
