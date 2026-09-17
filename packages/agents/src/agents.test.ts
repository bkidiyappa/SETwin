import { describe, expect, it } from "vitest";
import { CODING_AGENTS, SCRUM_ROLES, createCodingAgentAdapters } from "./index.ts";

describe("agents", () => {
  it("exposes all scrum roles and coding agents", () => {
    expect(SCRUM_ROLES).toContain("product_owner");
    expect(SCRUM_ROLES).toContain("reviewer");
    expect(CODING_AGENTS).toEqual(["opencode", "openhands", "claude-code", "cursor", "windsurf"]);
    expect(createCodingAgentAdapters()).toHaveLength(5);
  });
});
