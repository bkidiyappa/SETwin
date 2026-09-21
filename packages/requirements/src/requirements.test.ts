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
});
