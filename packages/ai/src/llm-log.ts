import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { findProjectRoot, getCorrelationId, getLogger, getSettings } from "@setwin/config";

export type LlmLogEntry = {
  task: string;
  actor: string | null;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  provider?: string;
  model?: string;
  status?: string;
  error?: string | null;
  system?: string;
  prompt?: string;
  response?: string;
  note?: string;
};

const RULE = "=".repeat(80);
const SUB = "-".repeat(80);

export function formatDuration(durationMs: number): string {
  const ms = Math.max(0, Math.round(durationMs));
  if (ms < 1000) {
    return `${ms} ms`;
  }
  const seconds = (ms / 1000).toFixed(3);
  return `${seconds} s (${ms} ms)`;
}

export function formatLlmExchange(entry: LlmLogEntry): string {
  const lines = [
    RULE,
    "LLM exchange",
    `Started:     ${entry.startedAt.toISOString()}`,
    `Finished:    ${entry.finishedAt.toISOString()}`,
    `Duration:    ${formatDuration(entry.durationMs)}`,
    `Task:        ${entry.task}`,
    `Actor:       ${entry.actor ?? "-"}`,
    `Correlation: ${getCorrelationId()}`,
  ];
  if (entry.provider) {
    lines.push(`Provider:    ${entry.provider}`);
  }
  if (entry.model) {
    lines.push(`Model:       ${entry.model}`);
  }
  if (entry.status) {
    lines.push(`Status:      ${entry.status}`);
  }
  if (entry.error) {
    lines.push(`Error:       ${entry.error}`);
  }
  if (entry.note) {
    lines.push(`Note:        ${entry.note}`);
  }
  lines.push(SUB);
  if (entry.system !== undefined) {
    lines.push("System", entry.system || "(empty)", "");
  }
  if (entry.prompt !== undefined) {
    lines.push("Request", entry.prompt || "(empty)", "");
  }
  if (entry.response !== undefined) {
    lines.push("Response", entry.response || "(empty)", "");
  }
  lines.push(RULE, "");
  return `${lines.join("\n")}\n`;
}

export function resolveLlmLogPath(): string {
  const settings = getSettings();
  const configured = settings.llmLogFile.trim();
  const relative = configured || path.join(settings.dataDir, "llm.log");
  return path.isAbsolute(relative) ? relative : path.resolve(findProjectRoot(), relative);
}

/** Append one readable exchange when SETWIN_LLM_LOG_REQUESTS is on. */
export function appendLlmLog(entry: LlmLogEntry): void {
  const settings = getSettings();
  if (!settings.llmLogRequests) {
    return;
  }
  const filePath = resolveLlmLogPath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  appendFileSync(filePath, formatLlmExchange(entry), "utf8");
  getLogger().info(
    {
      llm: true,
      task: entry.task,
      status: entry.status ?? null,
      durationMs: entry.durationMs,
      file: filePath,
    },
    "llm.log",
  );
}
