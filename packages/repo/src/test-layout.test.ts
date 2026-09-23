import { describe, expect, it } from "vitest";
import {
  formatTestLayoutForPrompt,
  intApiTestPath,
  isTestPath,
  resolveTestLayout,
  unitTestPath,
} from "./test-layout.ts";

describe("test layout", () => {
  it("uses SETwin tst/ tree for empty repos and scaffolds dirs", async () => {
    const layout = await resolveTestLayout({ repoPath: "", existingRelativePaths: [] });
    expect(layout.mode).toBe("setwin");
    expect(layout.unitDir).toBe("tst/unit");
    expect(layout.intApiDir).toBe("tst/int/api");
    expect(layout.intUiDir).toBe("tst/int/ui");
    expect(layout.scaffoldFiles.map((row) => row.path)).toEqual([
      "tst/unit/.gitkeep",
      "tst/int/api/.gitkeep",
      "tst/int/ui/.gitkeep",
    ]);
    expect(unitTestPath(layout, "Login")).toBe("tst/unit/Login.test.ts");
    expect(intApiTestPath(layout, "Login")).toBe("tst/int/api/Login.int.test.ts");
    expect(formatTestLayoutForPrompt(layout)).toContain("tst/unit");
  });

  it("follows an existing tst/ tree without inventing colocated tests", async () => {
    const layout = await resolveTestLayout({
      repoPath: "",
      existingRelativePaths: ["tst/unit/foo.test.ts", "src/foo.ts"],
    });
    expect(layout.mode).toBe("existing");
    expect(layout.unitDir).toBe("tst/unit");
    expect(unitTestPath(layout, "bar")).toBe("tst/unit/bar.test.ts");
  });

  it("follows colocated *.test.ts when that convention already exists", async () => {
    const layout = await resolveTestLayout({
      repoPath: "",
      existingRelativePaths: ["src/foo.ts", "src/foo.test.ts"],
    });
    expect(layout.mode).toBe("existing");
    expect(layout.guidance).toMatch(/colocated/i);
    expect(layout.scaffoldFiles).toHaveLength(0);
  });

  it("detects tst paths as tests", () => {
    expect(isTestPath("tst/unit/a.test.ts")).toBe(true);
    expect(isTestPath("tst/int/api/a.int.test.ts")).toBe(true);
    expect(isTestPath("src/a.ts")).toBe(false);
  });
});
