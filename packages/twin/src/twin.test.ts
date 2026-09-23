import { ARTIFACT_PREFIX, ARTIFACT_TYPES, RELATIONSHIP_TYPES } from "./types.ts";
import { describe, expect, it } from "vitest";

describe("twin catalogs", () => {
  it("assigns prefixes for every artifact type (TEST and GHERKIN share TST)", () => {
    const prefixes = ARTIFACT_TYPES.map((type) => ARTIFACT_PREFIX[type]);
    expect(prefixes).toHaveLength(ARTIFACT_TYPES.length);
    expect(ARTIFACT_PREFIX.TEST).toBe("TST");
    expect(ARTIFACT_PREFIX.GHERKIN).toBe("TST");
    const uniqueExceptShared = prefixes.filter((prefix) => prefix !== "TST");
    expect(new Set(uniqueExceptShared).size).toBe(uniqueExceptShared.length);
    expect(new Set(prefixes).size).toBe(ARTIFACT_TYPES.length - 1);
  });

  it("includes SUPERSEDES among relationship types", () => {
    expect(RELATIONSHIP_TYPES).toContain("SUPERSEDES");
    expect(RELATIONSHIP_TYPES).toContain("IMPLEMENTS");
    expect(RELATIONSHIP_TYPES).toContain("VALIDATES");
  });
});
