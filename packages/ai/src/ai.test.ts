import { describe, expect, it } from "vitest";
import {
  agentForRequest,
  createOllamaProvider,
  extractJsonObject,
  mergeLlmRoutes,
  parseLlmRouteSpec,
  requireAiCompletion,
  resolveAgentAssignment,
  routeProviders,
  stripModelReasoning,
} from "./index.ts";
import { formatDuration, formatLlmExchange } from "./llm-log.ts";

describe("ai gateway", () => {
  it("routes sensitive tasks to local/enterprise providers first", () => {
    expect(routeProviders("sensitive")[0]).toBe("ollama");
    expect(routeProviders("gherkin.generate", "anthropic")[0]).toBe("anthropic");
  });

  it("assigns a different model to each agent and lets others share the default", () => {
    const routes = parseLlmRouteSpec(
      "default=openai:gpt-4o-mini,requirements=openai:gpt-4o,architecture=bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0,coding=ollama:qwen2.5:7b,tests=bedrock:amazon.nova-pro-v1:0",
    );
    expect(routes.coding).toEqual({ provider: "ollama", model: "qwen2.5:7b" });
    expect(routes.architecture.model).toBe("anthropic.claude-3-5-sonnet-20241022-v2:0");
    expect(resolveAgentAssignment("tests", routes)?.model).toBe("amazon.nova-pro-v1:0");
    expect(resolveAgentAssignment("security", routes)?.provider).toBe("openai");
    expect(agentForRequest({ task: "story.split" })).toBe("requirements");
    expect(agentForRequest({ task: "artifact.code" })).toBe("coding");
    const cleared = mergeLlmRoutes(routes, [{ agent: "coding", provider: "", model: "" }]);
    expect(cleared.coding).toBeUndefined();
    expect(resolveAgentAssignment("coding", cleared)?.model).toBe("gpt-4o-mini");
  });

  it("returns unavailable when ollama is down", async () => {
    const provider = createOllamaProvider();
    process.env.SETWIN_OLLAMA_BASE_URL = "http://127.0.0.1:9";
    const result = await provider.complete({ task: "ping", prompt: "hello" });
    expect(result.status).toBe("unavailable");
    expect(result.error).toBeTruthy();
  });

  it("requireAiCompletion throws with provider error detail", () => {
    expect(() =>
      requireAiCompletion(
        {
          provider: "ollama",
          model: "qwen",
          text: "",
          status: "unavailable",
          error: "fetch failed",
        },
        "artifact.design",
      ),
    ).toThrow(/LLM unavailable for artifact\.design: fetch failed/);
  });

  it("formats a readable exchange with timings", () => {
    expect(formatDuration(842)).toBe("842 ms");
    expect(formatDuration(12500)).toBe("12.500 s (12500 ms)");
    const text = formatLlmExchange({
      task: "story.split",
      actor: "admin",
      startedAt: new Date("2026-09-23T06:00:00.000Z"),
      finishedAt: new Date("2026-09-23T06:00:12.500Z"),
      durationMs: 12500,
      provider: "ollama",
      model: "qwen",
      status: "ok",
      system: "You are a PO",
      prompt: "Split this",
      response: "Feature: Cancel",
    });
    expect(text).toContain("Started:     2026-09-23T06:00:00.000Z");
    expect(text).toContain("Finished:    2026-09-23T06:00:12.500Z");
    expect(text).toContain("Duration:    12.500 s (12500 ms)");
    expect(text).toContain("Request\nSplit this");
    expect(text).toContain("Response\nFeature: Cancel");
  });

  it("strips think blocks and repairs a broken JSON key", () => {
    const raw = `<think>planning</think>\n{\n  "title": "RBAC",\n  " "path": "src/a.ts"\n}`;
    expect(stripModelReasoning(raw).startsWith("{")).toBe(true);
    const json = extractJsonObject(raw);
    expect(json).toBeTruthy();
    expect(JSON.parse(json!).path).toBe("src/a.ts");
    const completion = requireAiCompletion(
      { provider: "ollama", model: "qwen3", text: "<think>x</think>\nFeature: Roles", status: "ok" },
      "artifact.tests",
    );
    expect(completion.text.startsWith("Feature:")).toBe(true);
  });
});
