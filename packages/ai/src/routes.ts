import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getSettings } from "@setwin/config";
import type { AiProviderName } from "./types.ts";

export const LLM_PROVIDERS: AiProviderName[] = ["ollama", "openai", "anthropic", "bedrock", "azure", "gemini"];

export const LLM_AGENTS = [
  { id: "default", label: "Default", hint: "Used for any agent that does not have its own model" },
  { id: "requirements", label: "Requirements", hint: "Stories and acceptance criteria" },
  { id: "architecture", label: "Architecture", hint: "Design and architecture drafts" },
  { id: "coding", label: "Coding", hint: "Implementation in the product repository" },
  { id: "tests", label: "Tests", hint: "Gherkin and test generation" },
] as const;

export type LlmAgentId = (typeof LLM_AGENTS)[number]["id"];

export type AgentModelAssignment = {
  provider: AiProviderName;
  model: string;
};

const TASK_AGENT: Record<string, LlmAgentId> = {
  "story.split": "requirements",
  "requirement.analyze": "requirements",
  "gherkin.generate": "tests",
  "artifact.design": "architecture",
  "artifact.architecture": "architecture",
  "artifact.code": "coding",
  "artifact.tests": "tests",
};

const ROLE_AGENT: Record<string, LlmAgentId> = {
  product_owner: "requirements",
  architect: "architecture",
  developer: "coding",
  qe: "tests",
};

export function llmAgentForRole(role: string): LlmAgentId | undefined {
  return ROLE_AGENT[role.trim().toLowerCase()];
}

export function agentForRequest(input: { agent?: string; task: string }): string | undefined {
  const explicit = input.agent?.trim().toLowerCase();
  if (explicit) {
    return explicit;
  }
  return TASK_AGENT[input.task];
}

export function parseLlmRouteSpec(spec: string): Record<string, AgentModelAssignment> {
  const routes: Record<string, AgentModelAssignment> = {};
  for (const part of spec.split(",")) {
    const piece = part.trim();
    if (!piece) {
      continue;
    }
    const eq = piece.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const agent = piece.slice(0, eq).trim().toLowerCase();
    const rest = piece.slice(eq + 1).trim();
    const assignment = parseProviderModel(rest);
    if (agent && assignment) {
      routes[agent] = assignment;
    }
  }
  return routes;
}

export function parseProviderModel(value: string): AgentModelAssignment | undefined {
  const text = value.trim();
  if (!text) {
    return undefined;
  }
  const colon = text.indexOf(":");
  const providerName = (colon === -1 ? text : text.slice(0, colon)).trim().toLowerCase();
  const model = colon === -1 ? "" : text.slice(colon + 1).trim();
  if (!isProviderName(providerName)) {
    return undefined;
  }
  return { provider: providerName, model };
}

export function isProviderName(value: string): value is AiProviderName {
  return (LLM_PROVIDERS as readonly string[]).includes(value);
}

export function resolveAgentAssignment(
  agent: string | undefined,
  routes: Record<string, AgentModelAssignment>,
): AgentModelAssignment | undefined {
  if (agent && routes[agent]) {
    return routes[agent];
  }
  return routes.default;
}

export type StoredLlmRoute = {
  agent: string;
  provider: string;
  model: string;
};

export function mergeLlmRoutes(
  fromEnv: Record<string, AgentModelAssignment>,
  stored: StoredLlmRoute[] | null,
): Record<string, AgentModelAssignment> {
  if (!stored) {
    return { ...fromEnv };
  }
  const merged = { ...fromEnv };
  for (const row of stored) {
    const agent = row.agent.trim().toLowerCase();
    if (!agent) {
      continue;
    }
    const provider = row.provider.trim().toLowerCase();
    if (!provider) {
      delete merged[agent];
      continue;
    }
    if (!isProviderName(provider)) {
      continue;
    }
    merged[agent] = { provider, model: row.model.trim() };
  }
  return merged;
}

export function routesFilePath(): string {
  const dir = path.resolve(getSettings().dataDir);
  return path.join(dir, "llm-routes.json");
}

export function readStoredLlmRoutes(): StoredLlmRoute[] | null {
  const file = routesFilePath();
  if (!existsSync(file)) {
    return null;
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { routes?: StoredLlmRoute[] };
  return Array.isArray(parsed.routes) ? parsed.routes : [];
}

export function writeStoredLlmRoutes(routes: StoredLlmRoute[]): void {
  const file = routesFilePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ routes }, null, 2)}\n`, "utf8");
}

export function loadEffectiveLlmRoutes(): Record<string, AgentModelAssignment> {
  return mergeLlmRoutes(parseLlmRouteSpec(process.env.SETWIN_LLM_ROUTES ?? ""), readStoredLlmRoutes());
}

export function effectiveRoutesForSetup(): StoredLlmRoute[] {
  const effective = loadEffectiveLlmRoutes();
  return LLM_AGENTS.map((agent) => ({
    agent: agent.id,
    provider: effective[agent.id]?.provider ?? "",
    model: effective[agent.id]?.model ?? "",
  }));
}
