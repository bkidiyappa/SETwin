import { asc, desc, eq } from "drizzle-orm";
import { auditEvents, withDatabase } from "@setwin/database";
import { GENESIS_HASH, hashAuditPayload } from "./hash.ts";
import { toRecord } from "./record.ts";
import type { AuditEventRecord } from "./types.ts";

export async function listAuditEvents(
  databaseUrl: string,
  options: { entityKey?: string; action?: string; limit?: number } = {},
): Promise<AuditEventRecord[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  return withDatabase(databaseUrl, async ({ db }) => {
    let rows = await db.select().from(auditEvents).orderBy(desc(auditEvents.sequence)).limit(limit);
    if (options.entityKey) {
      rows = rows.filter((row) => row.entityKey === options.entityKey);
    }
    if (options.action) {
      rows = rows.filter((row) => row.action === options.action);
    }
    return rows.map(toRecord);
  });
}

export async function getAuditEvent(
  databaseUrl: string,
  idOrSequence: string,
): Promise<AuditEventRecord | null> {
  return withDatabase(databaseUrl, async ({ db }) => {
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrSequence,
    );
    if (uuidLike) {
      const byId = (await db.select().from(auditEvents).where(eq(auditEvents.id, idOrSequence)))[0];
      if (byId) {
        return toRecord(byId);
      }
    }
    const sequence = Number(idOrSequence);
    if (!Number.isInteger(sequence)) {
      return null;
    }
    const bySeq = (
      await db.select().from(auditEvents).where(eq(auditEvents.sequence, sequence))
    )[0];
    return bySeq ? toRecord(bySeq) : null;
  });
}

export async function verifyAuditChain(databaseUrl: string): Promise<{
  ok: boolean;
  checked: number;
  brokenAt?: number;
  detail?: string;
}> {
  return withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db.select().from(auditEvents).orderBy(asc(auditEvents.sequence));
    let previousHash = GENESIS_HASH;
    for (const row of rows) {
      if (row.previousHash !== previousHash) {
        return {
          ok: false,
          checked: rows.length,
          brokenAt: row.sequence,
          detail: `previous hash mismatch at sequence ${row.sequence}`,
        };
      }
      const expected = hashAuditPayload({
        sequence: row.sequence,
        correlationId: row.correlationId,
        action: row.action,
        actorId: row.actorId ?? "",
        actorUsername: row.actorUsername,
        actorRoles: row.actorRoles,
        entityType: row.entityType,
        entityId: row.entityId,
        entityKey: row.entityKey,
        version: row.version === null ? "" : String(row.version),
        beforeJson: row.beforeJson ?? "",
        afterJson: row.afterJson ?? "",
        metadataJson: row.metadataJson,
        previousHash: row.previousHash,
        createdAt: row.createdAt.toISOString(),
      });
      if (expected !== row.eventHash) {
        return {
          ok: false,
          checked: rows.length,
          brokenAt: row.sequence,
          detail: `event hash mismatch at sequence ${row.sequence}`,
        };
      }
      previousHash = row.eventHash;
    }
    return { ok: true, checked: rows.length };
  });
}
