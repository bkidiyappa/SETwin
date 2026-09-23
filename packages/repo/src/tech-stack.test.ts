import { describe, expect, it } from "vitest";
import { formatTechStackForPrompt, resolveTechStack } from "./tech-stack.ts";

describe("tech stack", () => {
  it("uses project settings when repo path is missing", async () => {
    const stack = await resolveTechStack({
      projectTechStack: [
        "language: Python",
        "framework: FastAPI",
        "packageManager: poetry",
        "testFramework: pytest",
      ].join("\n"),
    });
    expect(stack.source).toBe("project_settings");
    expect(stack.language).toBe("Python");
    expect(stack.framework).toBe("FastAPI");
    expect(formatTechStackForPrompt(stack)).toContain("Language: Python");
  });

  it("falls back to default when nothing configured", async () => {
    const stack = await resolveTechStack({});
    expect(stack.source).toBe("default");
    expect(stack.language).toBe("TypeScript");
  });

  it("parses JSON project settings", async () => {
    const stack = await resolveTechStack({
      projectTechStack: JSON.stringify({
        language: "Go",
        testFramework: "go test",
      }),
    });
    expect(stack.language).toBe("Go");
    expect(stack.testFramework).toBe("go test");
  });
});
