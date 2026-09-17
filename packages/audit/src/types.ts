export type AuditEventRecord = {
  id: string;
  sequence: number;
  correlationId: string;
  action: string;
  actorId: string | null;
  actorUsername: string;
  actorRoles: string[];
  entityType: string;
  entityId: string;
  entityKey: string;
  version: number | null;
  before: unknown | null;
  after: unknown | null;
  metadata: Record<string, unknown>;
  previousHash: string;
  eventHash: string;
  createdAt: Date;
};

export type RecordAuditInput = {
  action: string;
  entityType: string;
  entityId: string;
  entityKey?: string;
  version?: number | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  actor?: {
    id?: string;
    username?: string;
    roles?: string[];
  };
  correlationId?: string;
};
