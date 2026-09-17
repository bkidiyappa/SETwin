import { describe, expect, it } from "vitest";
import { visualizationSeries } from "./index.ts";

describe("openvector", () => {
  it("exports visualization API", () => {
    expect(typeof visualizationSeries).toBe("function");
  });
});
