import { DEFAULT_APPROVAL_POLICIES } from "./review-catalog.ts";
import { parseFindingSeverity, parseReviewDecision } from "./review.ts";
import { describe, expect, it } from "vitest";

describe("approval policies", () => {
  it("requires parallel engineering and security approval for code", () => {
    const code = DEFAULT_APPROVAL_POLICIES.filter((policy) => policy.artifactType === "CODE");
    expect(code.map((policy) => policy.requiredRole)).toEqual(["engineering_manager", "security_reviewer"]);
    expect(code.every((policy) => policy.mode === "PARALLEL")).toBe(true);
  });

  it("requires sequential architect then engineering manager for architecture", () => {
    const architecture = DEFAULT_APPROVAL_POLICIES.filter((policy) => policy.artifactType === "ARCHITECTURE");
    expect(architecture.map((policy) => policy.requiredRole)).toEqual(["architect", "engineering_manager"]);
    expect(architecture.every((policy) => policy.mode === "SEQUENTIAL")).toBe(true);
  });
});

describe("review parsers", () => {
  it("accepts finding severities and review decisions", () => {
    expect(parseFindingSeverity("high")).toBe("HIGH");
    expect(parseReviewDecision("request-changes")).toBe("CHANGES_REQUESTED");
    expect(parseReviewDecision("approve")).toBe("APPROVE");
  });
});
