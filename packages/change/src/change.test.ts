import { describe, expect, it } from "vitest";
import { scoreRisk } from "./index.ts";

describe("change intelligence", () => {
  it("scores risk from file and symbol impact", () => {
    const low = scoreRisk({ changedFiles: 1, impactedSymbols: 1, languages: ["typescript"] });
    expect(low.riskLevel).toBe("LOW");
    const high = scoreRisk({ changedFiles: 25, impactedSymbols: 30, languages: ["typescript"] });
    expect(high.riskLevel).toBe("HIGH");
  });
});
