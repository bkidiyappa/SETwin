import { describe, expect, it } from "vitest";
import { analyzeRequirement, parseStoryDrafts } from "./index.ts";

describe("requirement intelligence", () => {
  it("detects ambiguity and business rules", () => {
    const checks = analyzeRequirement(
      "Users must somehow cancel an unpaid order within 30 minutes if needed.",
    );
    expect(checks.ambiguities.length).toBeGreaterThan(0);
    expect(checks.businessRules.length).toBeGreaterThan(0);
  });

  it("detects conflicting time windows", () => {
    const checks = analyzeRequirement("Cancel within 30 minutes and within 2 hours.");
    expect(checks.conflicts.some((row) => row.includes("time windows"))).toBe(true);
  });

  it("parses multiple stories from JSON", () => {
    const drafts = parseStoryDrafts(
      JSON.stringify({
        stories: [
          { title: "Cancel unpaid", content: "Cancel within 30 minutes when unpaid." },
          { title: "Paid lock", content: "Paid orders cannot be cancelled." },
        ],
      }),
      "fallback",
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0].title).toBe("Cancel unpaid");
  });

  it("keeps structured acceptance criteria as Gherkin instead of a stub", () => {
    const drafts = parseStoryDrafts(
      JSON.stringify({
        stories: [
          {
            title: "Login Page Creation",
            description: "Implement a login page for enterprise users.",
            acceptance_criteria: [
              {
                feature: "Login Page",
                scenarios: [
                  {
                    scenario: "User submits invalid credentials",
                    given: "User is on the login page",
                    when: "User enters invalid username or password and clicks login",
                    then: "An error message is displayed indicating invalid credentials",
                  },
                ],
              },
            ],
          },
          {
            title: "Dashboard Redirect on Login",
            description: "Redirect the user to the dashboard after login.",
            acceptance_criteria: [
              {
                feature: "Dashboard Redirect",
                scenarios: [
                  {
                    scenario: "Successful login redirects to dashboard",
                    given: "User has successfully logged in",
                    when: "User completes the login process",
                    then: "User is redirected to the dashboard page",
                  },
                ],
              },
            ],
          },
        ],
        ambiguity_conflicts: [{ type: "ambiguity", description: "Role selection is unspecified." }],
      }),
      "login",
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0].title).toBe("Login Page Creation");
    expect(drafts[0].content).toContain("Scenario: User submits invalid credentials");
    expect(drafts[0].content).toContain("Then An error message is displayed indicating invalid credentials");
    expect(drafts[0].content).not.toContain('action for "{"');
    expect(drafts[0].content).toContain("Role selection is unspecified.");
    expect(drafts[1].title).toBe("Dashboard Redirect on Login");
    expect(drafts[1].content).toContain("Feature: Dashboard Redirect");
  });

  it("does not invent a generic acceptance scenario", () => {
    const drafts = parseStoryDrafts(
      JSON.stringify({
        stories: [
          {
            title: "Login Page UI",
            description: "Show a login form.",
            acceptanceCriteria:
              "Given the user navigates to the login page, When they view the page, Then they see a form.",
          },
        ],
      }),
      "login",
    );
    expect(drafts[0].content).toContain("Then they see a form.");
    expect(drafts[0].content).not.toContain("Scenario: Acceptance");
    expect(drafts[0].content).not.toContain("the precondition is met");
  });
});
