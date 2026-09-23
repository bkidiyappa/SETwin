import { access, readFile } from "node:fs/promises";
import path from "node:path";

export type TechStackInfo = {
  language: string;
  runtime?: string;
  framework?: string;
  packageManager?: string;
  testFramework?: string;
  buildTool?: string;
  notes?: string;
  source: "repository" | "project_settings" | "default";
};

function parseTechStackText(raw: string): TechStackInfo | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      return {
        language: String(parsed.language ?? parsed.Language ?? "").trim() || "unspecified",
        runtime: optionalString(parsed.runtime ?? parsed.Runtime),
        framework: optionalString(parsed.framework ?? parsed.Framework),
        packageManager: optionalString(parsed.packageManager ?? parsed.package_manager),
        testFramework: optionalString(parsed.testFramework ?? parsed.test_framework),
        buildTool: optionalString(parsed.buildTool ?? parsed.build_tool),
        notes: optionalString(parsed.notes ?? parsed.Notes),
        source: "project_settings",
      };
    }
  } catch {
    // plain text / line-oriented settings
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const pick = (label: string): string | undefined => {
    const row = lines.find((line) => new RegExp(`^${label}\\s*[:=]`, "i").test(line));
    return row?.split(/[:=]/).slice(1).join(":").trim() || undefined;
  };
  return {
    language: pick("language") || pick("lang") || lines[0] || "unspecified",
    runtime: pick("runtime"),
    framework: pick("framework"),
    packageManager: pick("packageManager") || pick("package manager"),
    testFramework: pick("testFramework") || pick("test framework") || pick("tests"),
    buildTool: pick("buildTool") || pick("build"),
    notes: pick("notes") || (lines.length > 1 ? lines.slice(1).join("\n") : undefined),
    source: "project_settings",
  };
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Infer tech stack from files present in a product repository. */
export async function detectTechStackFromRepo(repoPath: string): Promise<TechStackInfo | null> {
  const root = repoPath.trim();
  if (!root) {
    return null;
  }

  const pkgPath = path.join(root, "package.json");
  if (await fileExists(pkgPath)) {
    const pkg = await readJson(pkgPath);
    const deps = {
      ...(typeof pkg?.dependencies === "object" && pkg.dependencies ? pkg.dependencies : {}),
      ...(typeof pkg?.devDependencies === "object" && pkg.devDependencies ? pkg.devDependencies : {}),
    } as Record<string, string>;
    const scripts = (pkg?.scripts ?? {}) as Record<string, string>;
    const has = (...names: string[]) => names.some((name) => name in deps);
    let framework = "Node.js";
    if (has("next")) {
      framework = "Next.js";
    } else if (has("react")) {
      framework = "React";
    } else if (has("vue")) {
      framework = "Vue";
    } else if (has("svelte")) {
      framework = "Svelte";
    } else if (has("express", "fastify", "koa", "hono")) {
      framework = "Node API";
    }
    let packageManager = "npm";
    if (await fileExists(path.join(root, "pnpm-lock.yaml"))) {
      packageManager = "pnpm";
    } else if (await fileExists(path.join(root, "yarn.lock"))) {
      packageManager = "yarn";
    } else if (await fileExists(path.join(root, "bun.lockb"))) {
      packageManager = "bun";
    }
    let testFramework = "node:test";
    if (has("vitest") || /vitest/i.test(JSON.stringify(scripts))) {
      testFramework = "vitest";
    } else if (has("jest") || /jest/i.test(JSON.stringify(scripts))) {
      testFramework = "jest";
    } else if (has("mocha")) {
      testFramework = "mocha";
    }
    const typescript = has("typescript") || (await fileExists(path.join(root, "tsconfig.json")));
    return {
      language: typescript ? "TypeScript" : "JavaScript",
      runtime: "Node.js",
      framework,
      packageManager,
      testFramework,
      buildTool: has("vite") ? "vite" : has("webpack") ? "webpack" : undefined,
      source: "repository",
    };
  }

  if (await fileExists(path.join(root, "pyproject.toml")) || (await fileExists(path.join(root, "requirements.txt")))) {
    let framework = "Python";
    if (await fileExists(path.join(root, "manage.py"))) {
      framework = "Django";
    } else if (await fileExists(path.join(root, "pyproject.toml"))) {
      const raw = await readFile(path.join(root, "pyproject.toml"), "utf8").catch(() => "");
      if (/fastapi/i.test(raw)) {
        framework = "FastAPI";
      } else if (/flask/i.test(raw)) {
        framework = "Flask";
      }
    }
    return {
      language: "Python",
      framework,
      packageManager: (await fileExists(path.join(root, "poetry.lock"))) ? "poetry" : "pip",
      testFramework: "pytest",
      source: "repository",
    };
  }

  if (await fileExists(path.join(root, "go.mod"))) {
    return { language: "Go", packageManager: "go", testFramework: "go test", source: "repository" };
  }
  if (await fileExists(path.join(root, "Cargo.toml"))) {
    return { language: "Rust", packageManager: "cargo", testFramework: "cargo test", source: "repository" };
  }
  if (await fileExists(path.join(root, "pom.xml"))) {
    return { language: "Java", buildTool: "Maven", testFramework: "JUnit", source: "repository" };
  }
  if (await fileExists(path.join(root, "build.gradle")) || (await fileExists(path.join(root, "build.gradle.kts")))) {
    return { language: "Java/Kotlin", buildTool: "Gradle", testFramework: "JUnit", source: "repository" };
  }
  if (await fileExists(path.join(root, "composer.json"))) {
    return { language: "PHP", packageManager: "composer", source: "repository" };
  }

  // Empty / unknown repo
  return null;
}

export function formatTechStackForPrompt(stack: TechStackInfo): string {
  const lines = [
    `Language: ${stack.language}`,
    stack.runtime ? `Runtime: ${stack.runtime}` : "",
    stack.framework ? `Framework: ${stack.framework}` : "",
    stack.packageManager ? `Package manager: ${stack.packageManager}` : "",
    stack.testFramework ? `Test framework: ${stack.testFramework}` : "",
    stack.buildTool ? `Build tool: ${stack.buildTool}` : "",
    stack.notes ? `Notes: ${stack.notes}` : "",
    `Source: ${stack.source}`,
  ].filter(Boolean);
  return lines.join("\n");
}

/** Prefer repository detection; fall back to project settings text; else a conservative default. */
export async function resolveTechStack(input: {
  repoPath?: string;
  projectTechStack?: string;
}): Promise<TechStackInfo> {
  if (input.repoPath) {
    const detected = await detectTechStackFromRepo(input.repoPath);
    if (detected) {
      return detected;
    }
  }
  const fromSettings = parseTechStackText(input.projectTechStack ?? "");
  if (fromSettings) {
    return fromSettings;
  }
  return {
    language: "TypeScript",
    runtime: "Node.js",
    framework: "unspecified",
    packageManager: "pnpm",
    testFramework: "vitest",
    notes:
      "No repo signals and no project tech stack configured — using SETwin default. Tests: tst/unit + tst/int/{api,ui}.",
    source: "default",
  };
}
