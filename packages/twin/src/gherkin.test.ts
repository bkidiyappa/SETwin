import { parseGherkin } from "./parse.ts";
import { describe, expect, it } from "vitest";
import { ValidationError } from "@setwin/auth";

const VALID = `Feature: Order cancellation

  Scenario: Customer cancels an eligible order
    Given an order was placed 10 minutes ago
    And the order has not been fulfilled
    When the customer cancels the order
    Then the order should be cancelled
    And the customer should receive confirmation
`;

describe("gherkin parser", () => {
  it("parses a feature with scenarios and steps", () => {
    const parsed = parseGherkin(VALID);
    expect(parsed.name).toBe("Order cancellation");
    expect(parsed.scenarios).toHaveLength(1);
    expect(parsed.scenarios[0]?.steps.map((step) => step.keyword)).toEqual([
      "Given",
      "And",
      "When",
      "Then",
      "And",
    ]);
  });

  it("rejects invalid gherkin", () => {
    expect(() => parseGherkin("this is not gherkin")).toThrow(ValidationError);
    expect(() => parseGherkin("Feature: Empty\n")).toThrow(/Scenario/);
  });
});
