import { describe, expect, it } from "vitest";
import { handleMcpRequest } from "./server.ts";

describe("mcp", () => {
  it("lists tools, resources, and prompts", async () => {
    const tools = (await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" })) as {
      result: { tools: unknown[] };
    };
    expect(tools.result.tools.length).toBeGreaterThanOrEqual(5);

    const resources = (await handleMcpRequest({ jsonrpc: "2.0", id: 2, method: "resources/list" })) as {
      result: { resources: unknown[] };
    };
    expect(resources.result.resources[0]).toMatchObject({ uri: "setwin://status" });

    const prompts = (await handleMcpRequest({ jsonrpc: "2.0", id: 3, method: "prompts/list" })) as {
      result: { prompts: unknown[] };
    };
    expect(prompts.result.prompts[0]).toMatchObject({ name: "requirement_to_gherkin" });
  });
});
