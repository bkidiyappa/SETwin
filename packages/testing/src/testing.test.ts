import { describe, expect, it } from "vitest";
import { parseJunitLike } from "./index.ts";

describe("testing ecosystem", () => {
  it("parses junit-like xml", () => {
    const xml = `
      <testsuite>
        <testcase name="ok" time="0.1"/>
        <testcase name="bad" time="0.2"><failure>boom</failure></testcase>
        <testcase name="skip" time="0"><skipped/></testcase>
      </testsuite>
    `;
    const results = parseJunitLike(xml);
    expect(results).toHaveLength(3);
    expect(results[0].status).toBe("passed");
    expect(results[1].status).toBe("failed");
    expect(results[2].status).toBe("skipped");
  });
});
