import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { getCorrelationId, getLogger, getSettings } from "@setwin/config";
import { requirePermission, type Principal } from "@setwin/auth";
import { aiActions, withDatabase } from "@setwin/database";
import { appendLlmLog } from "./llm-log.ts";
import { createAllProviders } from "./providers.ts";
import type { AiCompletionRequest, AiCompletionResult, AiProvider, AiProviderName } from "./types.ts";

export { requireAiCompletion } from "./require.ts";

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

function truncateForLog(text: string, maxChars: number): { text: string; truncated: boolean; originalLength: number } {
  const originalLength = text.length;
  if (maxChars <= 0 || originalLength <= maxChars) {
    return { text, truncated: false, originalLength };
  }
  return {
    text: `${text.slice(0, maxChars)}\n…[truncated ${originalLength - maxChars} chars]`,
    truncated: true,
    originalLength,
  };
}

export async function completeViaGateway(
  databaseUrl: string,
  request: AiCompletionRequest,
  actor?: Principal,
  options: GatewayOptions = {},
): Promise<AiCompletionResult & { actionId: string }> {
  if (actor) {
    await requirePermission(databaseUrl, actor, "ai:use");
  }
  const settings = getSettings();
  const maxChars = settings.llmLogMaxChars;
  const systemLogged = truncateForLog(request.system ?? "", maxChars);
  const promptLogged = truncateForLog(request.prompt, maxChars);
  const callStarted = new Date();

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
    const attemptStarted = new Date();
    const result = await provider.complete(request);
    const attemptFinished = new Date();
    lastAttempt = result;
    const responseLogged = truncateForLog(result.text ?? "", maxChars);
    appendLlmLog({
      task: request.task,
      actor: actor?.username ?? null,
      startedAt: attemptStarted,
      finishedAt: attemptFinished,
      durationMs: attemptFinished.getTime() - attemptStarted.getTime(),
      provider: result.provider,
      model: result.model,
      status: result.status,
      error: result.error ?? null,
      system: systemLogged.text,
      prompt: promptLogged.text,
      response: responseLogged.text,
      note: options.preferredProvider ? `preferred=${options.preferredProvider}` : undefined,
    });
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
  const callFinished = new Date();
  if (!lastAttempt) {
    appendLlmLog({
      task: request.task,
      actor: actor?.username ?? null,
      startedAt: callStarted,
      finishedAt: callFinished,
      durationMs: callFinished.getTime() - callStarted.getTime(),
      provider: failed.provider,
      model: failed.model,
      status: failed.status,
      error: failed.error ?? null,
      system: systemLogged.text,
      prompt: promptLogged.text,
      response: "",
      note: skipNotes.length ? `Skipped: ${skipNotes.join("; ")}` : undefined,
    });
  }
  getLogger().warn(
    {
      llm: true,
      phase: "unavailable",
      task: request.task,
      provider: failed.provider,
      model: failed.model,
      status: failed.status,
      error: failed.error ?? null,
      durationMs: callFinished.getTime() - callStarted.getTime(),
      skipped: skipNotes,
    },
    "llm.unavailable",
  );
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
