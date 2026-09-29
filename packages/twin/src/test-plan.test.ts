import { describe, expect, it } from "vitest";
import { classifyMasterPlan, classifyTestPlan, extractSourcePaths, isNonFunctional, masterPlanName } from "./test-plan.ts";

const since = new Date("2026-09-01T00:00:00.000Z");

describe("classifyTestPlan", () => {
  it("splits critical and regression tests, and pulls non-functional tags out", () => {
    const plan = classifyTestPlan(
      [
        artifact("CODE-1", "CODE", "2026-09-02T00:00:00.000Z", '{"files":[{"path":"src/pay.ts"}]}'),
        artifact("DSN-1", "DESIGN", "2026-08-01T00:00:00.000Z", "checkout design"),
        artifact("STY-1", "STORY", "2026-08-01T00:00:00.000Z", "checkout story"),
        artifact("DSN-2", "DESIGN", "2026-08-01T00:00:00.000Z", "sibling design"),
        artifact("TST-1", "GHERKIN", "2026-08-01T00:00:00.000Z", "Feature: pay"),
        artifact("TST-2", "GHERKIN", "2026-08-01T00:00:00.000Z", "Feature: load\n@performance"),
        artifact("TST-3", "TEST", "2026-08-01T00:00:00.000Z", "sibling story test"),
        artifact("CODE-OLD", "CODE", "2026-01-01T00:00:00.000Z", "src/old.ts"),
      ],
      [
        { from: "CODE-1", to: "DSN-1", type: "IMPLEMENTS" },
        { from: "DSN-1", to: "STY-1", type: "DESIGNED_BY" },
        { from: "DSN-2", to: "STY-1", type: "DESIGNED_BY" },
        { from: "TST-1", to: "DSN-1", type: "TESTED_BY" },
        { from: "TST-2", to: "DSN-1", type: "VALIDATES" },
        { from: "TST-3", to: "DSN-2", type: "TESTED_BY" },
      ],
      since,
    );
    expect(plan.code.map((row) => row.key)).toEqual(["CODE-1"]);
    expect(plan.items.find((row) => row.key === "TST-1")?.lane).toBe("critical_functional");
    expect(plan.items.find((row) => row.key === "TST-2")?.lane).toBe("critical_nonfunctional");
    expect(plan.items.find((row) => row.key === "TST-3")?.lane).toBe("regression_functional");
  });

  it("includes every test in the master plan", () => {
    const plan = classifyMasterPlan(
      [
        artifact("CODE-1", "CODE", "2026-09-02T00:00:00.000Z", "src/pay.ts"),
        artifact("DSN-1", "DESIGN", "2026-08-01T00:00:00.000Z", "checkout design"),
        artifact("TST-1", "GHERKIN", "2026-08-01T00:00:00.000Z", "Feature: pay"),
        artifact("TST-9", "TEST", "2026-08-01T00:00:00.000Z", "orphan test"),
      ],
      [{ from: "CODE-1", to: "DSN-1", type: "IMPLEMENTS" }, { from: "TST-1", to: "DSN-1", type: "TESTED_BY" }],
    );
    expect(plan.items.map((row) => row.key).sort()).toEqual(["TST-1", "TST-9"]);
    expect(plan.code.map((row) => row.key)).toEqual(["CODE-1"]);
    expect(masterPlanName("Order Demo")).toBe("Master Test Plan - Order Demo");
  });

  it("reads file paths from code content", () => {
    expect(extractSourcePaths('{"files":[{"path":"src/a.ts"}]} and src/b.py')).toEqual(["src/a.ts", "src/b.py"]);
    expect(isNonFunctional("@security")).toBe(true);
  });
});

function artifact(key: string, type: string, versionCreatedAt: string, content: string) {
  return { key, type, title: key, content, workflowState: "APPROVED", versionCreatedAt };
}
