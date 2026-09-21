import { describe, expect, it } from "vitest";
import {
  CODING_AGENTS,
  SCRUM_ROLES,
  buildRoleSystemPrompt,
  createCodingAgentAdapters,
  getRoleSkill,
  getSkillsDirectory,
  listRoleSkills,
  roleForArtifactType,
} from "./index.ts";

describe("agents", () => {
  it("exposes all scrum roles and coding agents", () => {
    expect(SCRUM_ROLES).toContain("product_owner");
    expect(SCRUM_ROLES).toContain("reviewer");
    expect(CODING_AGENTS).toEqual(["opencode", "openhands", "claude-code", "cursor", "windsurf"]);
    expect(createCodingAgentAdapters()).toHaveLength(5);
  });

  it("loads PO skills from markdown with multi-story and feedback tasks", () => {
    expect(getSkillsDirectory()).toMatch(/skills$/);
    const po = getRoleSkill("product_owner");
    expect(po.sourcePath).toMatch(/product_owner\.md$/);
    expect(po.tasks.map((task) => task.id)).toContain("prompt_to_stories");
    expect(po.tasks.map((task) => task.id)).toContain("respond_to_approval_feedback");
    expect(listRoleSkills()).toHaveLength(SCRUM_ROLES.length);
    const prompt = buildRoleSystemPrompt("product_owner", "prompt_to_stories");
    expect(prompt).toContain("Guardrails:");
    expect(prompt).toContain("Prompt → Stories");
    expect(prompt).toContain("Never approve");
  });

  it("maps artifact types to owning roles for rejection revisions", () => {
    expect(roleForArtifactType("STORY")).toBe("product_owner");
    expect(roleForArtifactType("ARCHITECTURE")).toBe("architect");
    expect(roleForArtifactType("CODE")).toBe("developer");
    expect(roleForArtifactType("TEST")).toBe("qe");
  });
});
