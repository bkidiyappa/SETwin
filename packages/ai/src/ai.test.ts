import { describe, expect, it } from "vitest";
import { createOllamaProvider, requireAiCompletion, routeProviders } from "./index.ts";
import { formatDuration, formatLlmExchange } from "./llm-log.ts";

describe("ai gateway", () => {
  it("routes sensitive tasks to local/enterprise providers first", () => {
    expect(routeProviders("sensitive")[0]).toBe("ollama");
    expect(routeProviders("gherkin.generate", "anthropic")[0]).toBe("anthropic");
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
});
