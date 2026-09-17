import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

export function hashAuditPayload(parts: {
  sequence: number;
  correlationId: string;
  action: string;
  actorId: string;
  actorUsername: string;
  actorRoles: string;
  entityType: string;
  entityId: string;
  entityKey: string;
  version: string;
  beforeJson: string;
  afterJson: string;
  metadataJson: string;
  previousHash: string;
  createdAt: string;
}): string {
  const material = [
    String(parts.sequence),
    parts.correlationId,
    parts.action,
    parts.actorId,
    parts.actorUsername,
    parts.actorRoles,
    parts.entityType,
    parts.entityId,
    parts.entityKey,
    parts.version,
    parts.beforeJson,
    parts.afterJson,
    parts.metadataJson,
    parts.previousHash,
    parts.createdAt,
  ].join("|");
  return createHash("sha256").update(material).digest("hex");
}
