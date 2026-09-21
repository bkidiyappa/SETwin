import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { getCorrelationId } from "@setwin/config";
import { requirePermission, type Principal } from "@setwin/auth";
import { aiActions, withDatabase } from "@setwin/database";
import { createAllProviders } from "./providers.ts";
import type { AiCompletionRequest, AiCompletionResult, AiProvider, AiProviderName } from "./types.ts";

const TASK_ROUTES: Record<string, AiProviderName[]> = {
  default: ["ollama", "openai", "anthropic", "azure", "gemini", "bedrock"],
  "gherkin.generate": ["ollama", "openai", "anthropic", "azure", "gemini", "bedrock"],
  "requirement.analyze": ["ollama", "openai", "anthropic", "azure", "gemini", "bedrock"],
  "agent.propose": ["ollama", "openai", "anthropic", "azure", "gemini", "bedrock"],
  sensitive: ["ollama", "azure", "bedrock"],
};

export type GatewayOptions = {
  preferredProvider?: AiProviderName;
  providers?: AiProvider[];
};

export async function completeViaGateway(
  databaseUrl: string,
  request: AiCompletionRequest,
  actor?: Principal,
  options: GatewayOptions = {},
): Promise<AiCompletionResult & { actionId: string }> {
  if (actor) {
    await requirePermission(databaseUrl, actor, "ai:use");
  }
  const providers = options.providers ?? createAllProviders();
  const order = routeProviders(request.task, options.preferredProvider);
  let lastAttempt: AiCompletionResult | undefined;
  const skipNotes: string[] = [];
  for (const name of order) {
    const provider = providers.find((row) => row.name === name);
    if (!provider) {
      continue;
    }
    if (!provider.isConfigured() && name !== "ollama") {
      skipNotes.push(`${name} not configured`);
      continue;
    }
    const result = await provider.complete(request);
    lastAttempt = result;
    if (result.status === "ok" && result.text.trim()) {
      const actionId = await persistAction(databaseUrl, request, result, actor);
      return { ...result, actionId };
    }
  }
  const failed: AiCompletionResult = lastAttempt
    ? {
        ...lastAttempt,
        error:
          lastAttempt.error ||
          (skipNotes.length > 0 ? `No usable provider. Skipped: ${skipNotes.join("; ")}` : "No AI provider available"),
      }
    : {
        provider: "ollama",
        model: request.model ?? "unknown",
        text: "",
        status: "unavailable",
        error:
          skipNotes.length > 0
            ? `No AI provider available. Skipped: ${skipNotes.join("; ")}`
            : "No AI provider available",
      };
  const actionId = await persistAction(databaseUrl, request, failed, actor);
  return { ...failed, actionId };
}

export function routeProviders(task: string, preferred?: AiProviderName): AiProviderName[] {
  const base = TASK_ROUTES[task] ?? TASK_ROUTES.default;
  if (!preferred) {
    return base;
  }
  return [preferred, ...base.filter((name) => name !== preferred)];
}

export async function listAiActions(
  databaseUrl: string,
  actor?: Principal,
  limit = 50,
): Promise<
  Array<{
    id: string;
    provider: string;
    model: string;
    task: string;
    status: string;
    error: string;
    createdAt: Date;
  }>
> {
  await requirePermission(databaseUrl, actor, "ai:use");
  return withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db.select().from(aiActions).orderBy(desc(aiActions.createdAt)).limit(limit);
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      model: row.model,
      task: row.task,
      status: row.status,
      error: row.error,
      createdAt: row.createdAt,
    }));
  });
}

async function persistAction(
  databaseUrl: string,
  request: AiCompletionRequest,
  result: AiCompletionResult,
  actor?: Principal,
): Promise<string> {
  const id = randomUUID();
  await withDatabase(databaseUrl, async ({ db }) => {
    await db.insert(aiActions).values({
      id,
      correlationId: getCorrelationId(),
      provider: result.provider,
      model: result.model,
      task: request.task,
      prompt: request.prompt,
      response: result.text,
      status: result.status,
      error: result.error ?? "",
      actorId: actor?.id ?? null,
      createdAt: new Date(),
    });
  });
  return id;
}

export { createAllProviders };
export type { AiCompletionRequest, AiCompletionResult, AiProvider, AiProviderName };
