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
  splitGherkinScenarios,
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

  it("splits multi-scenario Gherkin into one document per Scenario", () => {
    const docs = splitGherkinScenarios(`Feature: Login Page Implementation
  Scenario: User can access the login page
    Given the login page is accessible
    When a user navigates to the login page
    Then the login page should be displayed
  Scenario: User can enter valid credentials and log in
    Given the login page is accessible
    When a user enters valid credentials
    Then the user should be authenticated
  Scenario: User can enter invalid credentials and receive an error message
    Given the login page is accessible
    When a user enters invalid credentials
    Then an error message should be displayed`);
    expect(docs).toHaveLength(3);
    expect(docs[0]?.title).toBe("User can access the login page");
    expect(docs[1]?.title).toBe("User can enter valid credentials and log in");
    expect(docs[2]?.title).toBe("User can enter invalid credentials and receive an error message");
    for (const doc of docs) {
      expect(doc.content).toMatch(/^Feature: Login Page Implementation/m);
      expect((doc.content.match(/^\s*Scenario:/gim) ?? []).length).toBe(1);
    }
  });

  it("parses Gherkin that follows a think block once the Feature line is kept", () => {
    const raw = `<think>drafting scenarios</think>\nFeature: Define User Roles and Permissions\n\n  Scenario: Admin can create a new role\n    Given a user is logged in as an admin\n    When the admin creates a role named "Editor"\n    Then the role is stored`;
    const featureAt = raw.search(/^\s*Feature\s*:/im);
    const docs = splitGherkinScenarios(raw.slice(featureAt));
    expect(docs).toHaveLength(1);
    expect(docs[0]?.title).toBe("Admin can create a new role");
  });
});
