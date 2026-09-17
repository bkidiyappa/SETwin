import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { getCorrelationId } from "@setwin/config";
import { auditEvents, withDatabase } from "@setwin/database";
import { GENESIS_HASH, hashAuditPayload } from "./hash.ts";
import type { AuditEventRecord, RecordAuditInput } from "./types.ts";

export async function recordAuditEvent(
  databaseUrl: string,
  input: RecordAuditInput,
): Promise<AuditEventRecord> {
  return withDatabase(databaseUrl, async ({ db }) => {
    const latest = (
      await db.select().from(auditEvents).orderBy(desc(auditEvents.sequence)).limit(1)
    )[0];
    const sequence = (latest?.sequence ?? 0) + 1;
    const previousHash = latest?.eventHash ?? GENESIS_HASH;
    const createdAt = new Date();
    const beforeJson = input.before === undefined ? null : JSON.stringify(input.before);
    const afterJson = input.after === undefined ? null : JSON.stringify(input.after);
    const metadataJson = JSON.stringify(input.metadata ?? {});
    const actorId = input.actor?.id ?? null;
    const actorUsername = input.actor?.username ?? "";
    const actorRoles = (input.actor?.roles ?? []).join(",");
    const correlationId = input.correlationId ?? getCorrelationId();
    const entityKey = input.entityKey ?? "";
    const version = input.version ?? null;
    const eventHash = hashAuditPayload({
      sequence,
      correlationId,
      action: input.action,
      actorId: actorId ?? "",
      actorUsername,
      actorRoles,
      entityType: input.entityType,
      entityId: input.entityId,
      entityKey,
      version: version === null ? "" : String(version),
      beforeJson: beforeJson ?? "",
      afterJson: afterJson ?? "",
      metadataJson,
      previousHash,
      createdAt: createdAt.toISOString(),
    });
    const row = {
      id: randomUUID(),
      sequence,
      correlationId,
      action: input.action,
      actorId,
      actorUsername,
      actorRoles,
      entityType: input.entityType,
      entityId: input.entityId,
      entityKey,
      version,
      beforeJson,
      afterJson,
      metadataJson,
      previousHash,
      eventHash,
      createdAt,
    };
    await db.insert(auditEvents).values(row);
    return toRecord(row);
  });
}

export function toRecord(row: typeof auditEvents.$inferSelect): AuditEventRecord {
  return {
    id: row.id,
    sequence: row.sequence,
    correlationId: row.correlationId,
    action: row.action,
    actorId: row.actorId,
    actorUsername: row.actorUsername,
    actorRoles: row.actorRoles ? row.actorRoles.split(",").filter(Boolean) : [],
    entityType: row.entityType,
    entityId: row.entityId,
    entityKey: row.entityKey,
    version: row.version,
    before: row.beforeJson ? JSON.parse(row.beforeJson) : null,
    after: row.afterJson ? JSON.parse(row.afterJson) : null,
    metadata: JSON.parse(row.metadataJson || "{}") as Record<string, unknown>,
    previousHash: row.previousHash,
    eventHash: row.eventHash,
    createdAt: row.createdAt,
  };
}
