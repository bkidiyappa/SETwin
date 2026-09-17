import { describe, expect, it } from "vitest";
import { INTEGRATION_PROVIDERS, listIntegrations } from "./index.ts";

describe("integrations", () => {
  it("lists enterprise providers", () => {
    expect(INTEGRATION_PROVIDERS).toContain("jira");
    expect(INTEGRATION_PROVIDERS).toContain("figma");
    expect(typeof listIntegrations).toBe("function");
  });
});
