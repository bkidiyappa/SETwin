import { ValidationError } from "@setwin/auth";
import { getLogger } from "@setwin/config";
import type { AiCompletionResult } from "./types.ts";

export type AiCompletionOk = AiCompletionResult & { status: "ok"; text: string };

/**
 * Ensures the gateway returned a usable completion. Throws ValidationError when the
 * model is unavailable / errored / empty so callers do not fall back to generic stubs.
 */
export function requireAiCompletion(
  result: AiCompletionResult & { actionId?: string },
  context: string,
): AiCompletionOk {
  if (result.status === "ok" && result.text.trim()) {
    return result as AiCompletionOk;
  }
  const detail =
    result.error?.trim() ||
    (result.status === "ok" ? "empty response from model" : `status=${result.status}`);
  const message = `LLM unavailable for ${context}: ${detail}`;
  getLogger().warn(
    {
      llm: true,
      phase: "unavailable",
      task: context,
      provider: result.provider,
      model: result.model,
      status: result.status,
      error: result.error ?? null,
      actionId: result.actionId ?? null,
    },
    "llm.unavailable",
  );
  throw new ValidationError(message);
}
