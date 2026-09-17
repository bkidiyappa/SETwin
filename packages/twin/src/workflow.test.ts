import { allowedActionsFor, WORKFLOW_GRAPH } from "./workflow-catalog.ts";
import { describe, expect, it } from "vitest";

describe("workflow graph", () => {
  it("only allows approve from IN_REVIEW", () => {
    expect(WORKFLOW_GRAPH.approve.from).toEqual(["IN_REVIEW"]);
    expect(allowedActionsFor("DRAFT")).toEqual(["submit"]);
    expect(allowedActionsFor("IN_REVIEW")).toEqual(["approve", "reject", "request_changes"]);
    expect(allowedActionsFor("APPROVED")).toEqual([]);
  });
});
