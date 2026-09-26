import { ValidationError } from "@setwin/auth";
import { getLogger } from "@setwin/config";
import type { AiCompletionResult } from "./types.ts";

export type AiCompletionOk = AiCompletionResult & { status: "ok"; text: string };

/** Drop qwen-style reasoning blocks so artifact parsers see only the answer. */
export function stripModelReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .trim();
}

/** Pull a JSON object out of a model reply, including light key typos like `" "path"`. */
export function extractJsonObject(text: string): string | null {
  const cleaned = stripModelReasoning(text);
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? cleaned).replace(/"\s+"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g, '"$1":');
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  return raw.slice(start, end + 1);
}

/**
 * Ensures the gateway returned a usable completion. Throws ValidationError when the
 * model is unavailable / errored / empty so callers do not fall back to generic stubs.
 */
export function requireAiCompletion(
  result: AiCompletionResult & { actionId?: string },
  context: string,
): AiCompletionOk {
  const text = result.status === "ok" ? stripModelReasoning(result.text) : "";
  if (text) {
    return { ...result, text, status: "ok" };
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
