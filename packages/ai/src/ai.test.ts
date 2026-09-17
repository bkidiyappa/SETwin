import { describe, expect, it } from "vitest";
import { createOllamaProvider, routeProviders } from "./index.ts";

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
});
