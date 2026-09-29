import { extractJsonObject } from "@setwin/ai";

export type WorkStep = {
  title: string;
  intent: string;
};

/** Read a model's step list. Empty when the reply is not a JSON step list. */
export function parseWorkSteps(text: string, limit = 6): WorkStep[] {
  const json = extractJsonObject(text);
  if (!json) {
    return [];
  }
  let parsed: { steps?: unknown };
  try {
    parsed = JSON.parse(json) as { steps?: unknown };
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.steps)) {
    return [];
  }
  const steps: WorkStep[] = [];
  for (const row of parsed.steps) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const record = row as { title?: unknown; intent?: unknown; name?: unknown };
    const title = String(record.title ?? record.name ?? "").trim();
    const intent = String(record.intent ?? "").trim();
    if (!title) {
      continue;
    }
    steps.push({ title: title.slice(0, 120), intent: intent.slice(0, 400) });
    if (steps.length >= limit) {
      break;
    }
  }
  return steps;
}
