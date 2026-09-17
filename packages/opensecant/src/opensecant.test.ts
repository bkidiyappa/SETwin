import { describe, expect, it } from "vitest";
import { generateTestsFromArtifact } from "./index.ts";

describe("opensecant", () => {
  it("exports generation API", () => {
    expect(typeof generateTestsFromArtifact).toBe("function");
  });
});
