import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { NotFoundError, requirePermission, type Principal } from "@setwin/auth";
import { engineeringEvents, projects, withDatabase } from "@setwin/database";

export async function recordEngineeringEvent(
  databaseUrl: string,
  input: {
    project?: string;
    category: string;
    name: string;
    value?: number;
    payload?: Record<string, unknown>;
    occurredAt?: Date;
  },
  actor?: Principal,
): Promise<{ id: string }> {
  await requirePermission(databaseUrl, actor, "metrics:write");
  let projectId: string | null = null;
  if (input.project) {
    projectId = await withDatabase(databaseUrl, async ({ db }) => {
      const row = (await db.select().from(projects).where(eq(projects.key, input.project!.trim().toLowerCase())))[0];
      if (!row) {
        throw new NotFoundError(`Project not found: ${input.project}`);
      }
      return row.id;
    });
  }
  const id = randomUUID();
  await withDatabase(databaseUrl, async ({ db }) => {
    await db.insert(engineeringEvents).values({
      id,
      projectId,
      category: input.category,
      name: input.name,
      value: input.value ?? null,
      payloadJson: JSON.stringify(input.payload ?? {}),
      occurredAt: input.occurredAt ?? new Date(),
      createdAt: new Date(),
    });
  });
  return { id };
}

export async function listEngineeringEvents(
  databaseUrl: string,
  actor?: Principal,
  limit = 100,
): Promise<
  Array<{ id: string; category: string; name: string; value: number | null; occurredAt: Date; payload: Record<string, unknown> }>
> {
  await requirePermission(databaseUrl, actor, "metrics:view");
  return withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db.select().from(engineeringEvents).orderBy(desc(engineeringEvents.occurredAt)).limit(limit);
    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      name: row.name,
      value: row.value,
      occurredAt: row.occurredAt,
      payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
    }));
  });
}

export async function visualizationSeries(
  databaseUrl: string,
  actor?: Principal,
): Promise<Array<{ category: string; name: string; points: Array<{ at: string; value: number }> }>> {
  const events = await listEngineeringEvents(databaseUrl, actor, 500);
  const groups = new Map<string, Array<{ at: string; value: number }>>();
  for (const event of events) {
    if (event.value === null) {
      continue;
    }
    const key = `${event.category}::${event.name}`;
    const points = groups.get(key) ?? [];
    points.push({ at: event.occurredAt.toISOString(), value: event.value });
    groups.set(key, points);
  }
  return [...groups.entries()].map(([key, points]) => {
    const [category, name] = key.split("::");
    return { category, name, points: points.reverse() };
  });
}
