import { describe, expect, it } from "vitest";
import { ValidationError } from "@setwin/auth";
import { generateTestsFromArtifact, openSecantFile, openSecantSlug } from "./index.ts";

describe("opensecant", () => {
  it("exports generation API", () => {
    expect(typeof generateTestsFromArtifact).toBe("function");
  });

  it("sends operators to Automate instead of inventing scenarios", async () => {
    await expect(generateTestsFromArtifact("postgresql://unused", { key: "TST-001", project: "demo" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("writes an OpenSecant script from a Gherkin scenario", () => {
    const file = openSecantFile(
      "Login form",
      ["Feature: Login", "  Scenario: Login form", "    Given the user is on the login page", "    Then the login form is visible"].join("\n"),
    );
    expect(file).toBe(["@smoke", "Test: Login form", "the user is on the login page", "the login form is visible", ""].join("\n"));
    expect(openSecantSlug("Login form", "TST-001")).toBe("login-form");
  });
});
