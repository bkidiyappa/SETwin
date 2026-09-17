import { describe, expect, it } from "vitest";
import { parseFile } from "./index.ts";

describe("repository intelligence", () => {
  it("parses typescript functions and classes", async () => {
    const source = `
export function hello(name: string) { return name; }
export class Greeter {
  greet() { return "hi"; }
}
`;
    const parsed = parseFile.toString().includes("parseFile");
    expect(parsed).toBe(true);
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
});
