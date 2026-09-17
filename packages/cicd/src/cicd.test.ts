import { describe, expect, it } from "vitest";
import { listPipelineAdapters, renderPipelineTemplate } from "./index.ts";

describe("cicd", () => {
  it("renders github actions and lists adapters", () => {
    const yaml = renderPipelineTemplate("github-actions");
    expect(yaml).toContain("pnpm test");
    expect(listPipelineAdapters()).toHaveLength(4);
  });
});
