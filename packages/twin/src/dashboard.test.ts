import { describe, expect, it } from "vitest";
import { summarizeProjectDashboard } from "./dashboard.ts";

describe("summarizeProjectDashboard", () => {
  it("counts stories, approved work, and implemented stories without artifact bodies", () => {
    const stats = summarizeProjectDashboard({
      projects: [{ id: "p1", key: "order", name: "Order", description: "Checkout" }],
      artifacts: [
        { projectId: "p1", key: "FEA-001", type: "FEATURE", workflowState: "APPROVED" },
        { projectId: "p1", key: "STY-001", type: "STORY", workflowState: "APPROVED" },
        { projectId: "p1", key: "STY-002", type: "STORY", workflowState: "IN_REVIEW" },
        { projectId: "p1", key: "DES-001", type: "DESIGN", workflowState: "APPROVED" },
        { projectId: "p1", key: "COD-001", type: "CODE", workflowState: "APPROVED" },
        { projectId: "p1", key: "TST-001", type: "GHERKIN", workflowState: "APPROVED" },
        { projectId: "p1", key: "TST-002", type: "GHERKIN", workflowState: "DRAFT" },
      ],
      relationships: [
        { projectId: "p1", fromKey: "STY-001", toKey: "DES-001" },
        { projectId: "p1", fromKey: "DES-001", toKey: "COD-001" },
        { projectId: "p1", fromKey: "DES-001", toKey: "TST-001" },
      ],
      repositoryCounts: new Map([["p1", 2]]),
    });
    expect(stats).toEqual([
      {
        key: "order",
        name: "Order",
        description: "Checkout",
        features: 1,
        repositories: 2,
        stories: 2,
        implementedStories: 1,
        storiesInReview: 1,
        designs: 1,
        designsApproved: 1,
        code: 1,
        codeApproved: 1,
        tests: 2,
        testsApproved: 1,
        testsInReview: 0,
      },
    ]);
  });
});
