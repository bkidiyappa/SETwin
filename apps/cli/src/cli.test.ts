import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { VERSION, clearSettingsCache } from "@setwin/config";
import { runCli } from "./cli.ts";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  clearSettingsCache();
});

async function invoke(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(argv, {
    log: (message) => stdout.push(message),
    error: (message) => stderr.push(message),
  });
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

describe("cli", () => {
  it("lists foundation commands in help", async () => {
    const result = await invoke(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("status");
    expect(result.stdout).toContain("init");
    expect(result.stdout).toContain("serve");
    expect(result.stdout).toContain("login");
    expect(result.stdout).toContain("whoami");
    expect(result.stdout).toContain("user");
    expect(result.stdout).toContain("role");
    expect(result.stdout).toContain("team");
    expect(result.stdout).toContain("project");
    expect(result.stdout).toContain("artifact");
    expect(result.stdout).toContain("relate");
    expect(result.stdout).toContain("gherkin");
    expect(result.stdout).toContain("workflow");
    expect(result.stdout).toContain("review");
  });

  it("prints the version", async () => {
    const result = await invoke(["--version"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(VERSION);
  });

  it("hides secrets in status", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "setwin-cli-"));
    process.env.SETWIN_DATABASE_URL = "postgresql://setwin:super-secret@127.0.0.1:1/setwin";
    process.env.SETWIN_DATA_DIR = path.join(root, "data");
    process.env.SETWIN_WORKSPACE_DIR = path.join(root, "workspace");
    clearSettingsCache();
    const result = await invoke(["status"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("SETwin");
    expect(result.stdout).not.toContain("super-secret");
    expect(result.stdout).toContain("***");
    expect(result.stdout).toContain("unreachable");
    await rm(root, { recursive: true, force: true });
    delete process.env.SETWIN_DATABASE_URL;
    delete process.env.SETWIN_DATA_DIR;
    delete process.env.SETWIN_WORKSPACE_DIR;
    clearSettingsCache();
  });

  it("creates directories when init cannot reach the database", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "setwin-cli-init-"));
    process.env.SETWIN_DATABASE_URL = "postgresql://setwin:super-secret@127.0.0.1:1/setwin";
    process.env.SETWIN_DATA_DIR = path.join(root, "data");
    process.env.SETWIN_WORKSPACE_DIR = path.join(root, "workspace");
    clearSettingsCache();
    const result = await invoke(["init"]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Database is unreachable");
    expect(result.stdout).not.toContain("super-secret");
    await rm(root, { recursive: true, force: true });
    delete process.env.SETWIN_DATABASE_URL;
    delete process.env.SETWIN_DATA_DIR;
    delete process.env.SETWIN_WORKSPACE_DIR;
    clearSettingsCache();
  });
});
