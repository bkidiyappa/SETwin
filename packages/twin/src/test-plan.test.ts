import { describe, expect, it } from "vitest";
import { classifyMasterPlan, classifyTestPlan, extractSourcePaths, isNonFunctional, masterPlanName, mergePlanItems, summarizeRuns } from "./test-plan.ts";

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

describe("mergePlanItems", () => {
  it("keeps a manually added test and drops a removed one", () => {
    const classified = [
      item("TST-1", "critical_functional"),
      item("TST-2", "regression_functional"),
    ];
    const manual = [item("TST-9", "critical_nonfunctional")];
    const merged = mergePlanItems(classified, manual, ["TST-2"]);
    expect(merged.map((row) => row.key)).toEqual(["TST-1", "TST-9"]);
    expect(merged.find((row) => row.key === "TST-9")?.lane).toBe("critical_nonfunctional");
  });

  it("keeps the lane chosen by hand when the product would place the test elsewhere", () => {
    const classified = [item("TST-1", "critical_functional")];
    const manual = [item("TST-1", "regression_nonfunctional")];
    expect(mergePlanItems(classified, manual, []).map((row) => row.lane)).toEqual(["regression_nonfunctional"]);
  });
});

describe("summarizeRuns", () => {
  it("gives every test linked to one script the same result", () => {
    const runs = [
      {
        name: "tests/smoke/login-form.test",
        status: "passed",
        adapter: "playwright",
        finishedAt: new Date("2026-09-29T12:00:00.000Z"),
        startedAt: new Date("2026-09-29T11:59:00.000Z"),
      },
    ];
    const summary = summarizeRuns(
      [
        { key: "TST-001", title: "Login form", content: "Feature: Login", scriptPath: "tests/smoke/login-form.test" },
        { key: "TST-002", title: "Missing password", content: "Feature: Login", scriptPath: "tests/smoke/login-form.test" },
        { key: "TST-003", title: "Manual only", content: "Feature: Other", scriptPath: null },
      ],
      runs,
    );
    expect(summary.byKey.get("TST-001")?.status).toBe("passed");
    expect(summary.byKey.get("TST-002")?.status).toBe("passed");
    expect(summary.byKey.get("TST-001")?.automated).toBe(true);
    expect(summary.byKey.get("TST-003")?.status).toBe("not_run");
    expect(summary.byKey.get("TST-003")?.automated).toBe(false);
  });
});

function item(key: string, lane: "critical_functional" | "critical_nonfunctional" | "regression_functional" | "regression_nonfunctional") {
  return { key, title: key, content: "", workflowState: "DRAFT", lane };
}

function artifact(key: string, type: string, versionCreatedAt: string, content: string) {
  return { key, type, title: key, content, workflowState: "APPROVED", versionCreatedAt };
}
