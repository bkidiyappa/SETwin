import { ARTIFACT_PREFIX, ARTIFACT_TYPES, RELATIONSHIP_TYPES } from "./types.ts";
import { describe, expect, it } from "vitest";

describe("twin catalogs", () => {
  it("assigns a unique prefix to every artifact type", () => {
    const prefixes = ARTIFACT_TYPES.map((type) => ARTIFACT_PREFIX[type]);
    expect(new Set(prefixes).size).toBe(ARTIFACT_TYPES.length);
  });

  it("includes SUPERSEDES among relationship types", () => {
    expect(RELATIONSHIP_TYPES).toContain("SUPERSEDES");
    expect(RELATIONSHIP_TYPES).toContain("IMPLEMENTS");
    expect(RELATIONSHIP_TYPES).toContain("VALIDATES");
  });
});
