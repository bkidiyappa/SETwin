import { describe, expect, it } from "vitest";
import { cosineSimilarity, embedText } from "./index.ts";

describe("context engine", () => {
  it("embeds similar texts closer than unrelated texts", () => {
    const a = embedText("cancel unpaid order within 30 minutes");
    const b = embedText("order cancellation unpaid window 30 minutes");
    const c = embedText("deploy kubernetes to production cluster");
    expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
  });
});
