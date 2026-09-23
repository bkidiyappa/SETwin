import { describe, expect, it } from "vitest";
import { parseFile, unifiedDiffForFile } from "./index.ts";

describe("repository intelligence", () => {
  it("parses typescript functions and classes", async () => {
    const source = `
export function hello(name: string) { return name; }
export class Greeter {
  greet() { return "hi"; }
}
`;
    const { writeFile, mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "setwin-repo-"));
    const file = join(dir, "sample.ts");
    await writeFile(file, source, "utf8");
    try {
      const result = await parseFile(file, dir);
      expect(result.symbols.some((row) => row.name === "hello")).toBe(true);
      expect(result.symbols.some((row) => row.name === "Greeter")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("builds unified diffs for add and modify", () => {
    const added = unifiedDiffForFile("src/a.ts", null, "export const a = 1;\n");
    expect(added).toContain("new file mode");
    expect(added).toContain("+export const a = 1;");
    const modified = unifiedDiffForFile("src/a.ts", "export const a = 1;\n", "export const a = 2;\n");
    expect(modified).toContain("-export const a = 1;");
    expect(modified).toContain("+export const a = 2;");
  });
});
