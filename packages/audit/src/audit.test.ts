import { createHash, randomUUID } from "node:crypto";
import net from "node:net";
import { describe, expect, it } from "vitest";
import { createSettings } from "@setwin/config";
import { applyMigrations, roles, userRoles, users, withDatabase } from "@setwin/database";
import { eq } from "drizzle-orm";
import { hashPassword, seedIdentityCatalog } from "@setwin/auth";
import {
  GENESIS_HASH,
  getAuditEvent,
  hashAuditPayload,
  listAuditEvents,
  recordAuditEvent,
  verifyAuditChain,
} from "./index.ts";

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

async function insertAdmin(databaseUrl: string, username: string, password: string): Promise<{ id: string }> {
  return withDatabase(databaseUrl, async ({ db }) => {
    const secret = await hashPassword(password);
    const id = randomUUID();
    const now = new Date();
    await db.insert(users).values({
      id,
      username,
      displayName: username,
      passwordHash: secret.hash,
      passwordSalt: secret.salt,
      disabled: false,
      createdAt: now,
      updatedAt: now,
    });
    const adminRole = (await db.select().from(roles).where(eq(roles.name, "administrator")))[0];
    if (!adminRole) {
      throw new Error("administrator role missing; seed the catalog first");
    }
    await db.insert(userRoles).values({ userId: id, roleId: adminRole.id });
    return { id };
  });
}

describe("audit", () => {
  it("hashes payloads deterministically", () => {
    const parts = {
      sequence: 1,
      correlationId: "c1",
      action: "project.create",
      actorId: "a1",
      actorUsername: "admin",
      actorRoles: "administrator",
      entityType: "project",
      entityId: "p1",
      entityKey: "demo",
      version: "",
      beforeJson: "",
      afterJson: "{}",
      metadataJson: "{}",
      previousHash: GENESIS_HASH,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const first = hashAuditPayload(parts);
    const second = hashAuditPayload(parts);
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
    expect(createHash("sha256").update("x").digest("hex")).not.toBe(first);
  });

  it("appends chained events and verifies the chain", async (context) => {
    if (!(await postgresListening())) {
      context.skip();
    }
    const settings = createSettings({
      databaseUrl: "postgresql://setwin:setwin@127.0.0.1:5432/setwin",
    });
    await applyMigrations(settings.databaseUrl);
    await seedIdentityCatalog(settings.databaseUrl);
    const suffix = randomUUID().slice(0, 8);
    const username = `audit_${suffix}`;
    const admin = await insertAdmin(settings.databaseUrl, username, "audit-pass");

    const first = await recordAuditEvent(settings.databaseUrl, {
      action: "project.create",
      entityType: "project",
      entityId: randomUUID(),
      entityKey: `p-${suffix}`,
      after: { key: `p-${suffix}` },
      actor: { id: admin.id, username, roles: ["administrator"] },
      correlationId: `corr-${suffix}`,
    });
    expect(first.sequence).toBeGreaterThanOrEqual(1);
    expect(first.previousHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.eventHash).toMatch(/^[0-9a-f]{64}$/);

    const second = await recordAuditEvent(settings.databaseUrl, {
      action: "artifact.create",
      entityType: "artifact",
      entityId: randomUUID(),
      entityKey: `REQ-${suffix}`,
      version: 1,
      before: null,
      after: { title: "Audit me" },
      actor: { id: admin.id, username, roles: ["administrator"] },
      correlationId: `corr-${suffix}-2`,
    });
    expect(second.previousHash).toBe(first.eventHash);

    const listed = await listAuditEvents(settings.databaseUrl, { limit: 10 });
    expect(listed.some((row) => row.id === first.id)).toBe(true);

    const shown = await getAuditEvent(settings.databaseUrl, String(first.sequence));
    expect(shown?.id).toBe(first.id);

    const verified = await verifyAuditChain(settings.databaseUrl);
    expect(verified.ok).toBe(true);
    expect(verified.checked).toBeGreaterThanOrEqual(2);
  });
});
