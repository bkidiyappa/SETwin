import { access, readdir } from "node:fs/promises";
import path from "node:path";

export type TestLayout = {
  /** Canonical SETwin layout vs an existing repo convention. */
  mode: "setwin" | "existing";
  unitDir: string;
  intDir: string;
  intApiDir: string;
  intUiDir: string;
  /** Short description for LLM prompts. */
  guidance: string;
  /** Marker / scaffold files to create when the repo has no test tree yet. */
  scaffoldFiles: Array<{ path: string; content: string }>;
};

const SETWIN_UNIT = "tst/unit";
const SETWIN_INT = "tst/int";
const SETWIN_INT_API = "tst/int/api";
const SETWIN_INT_UI = "tst/int/ui";

const GITKEEP = "# Keep this directory in git.\n";

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeRel(relativePath: string): string {
  return relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function pathsUnder(prefix: string, files: string[]): string[] {
  const p = prefix.replace(/\/$/, "").toLowerCase();
  return files.filter((file) => {
    const n = normalizeRel(file).toLowerCase();
    return n === p || n.startsWith(`${p}/`);
  });
}

function hasPrefix(files: string[], ...prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathsUnder(prefix, files).length > 0);
}

/** True when a relative path looks like a test file (any convention). */
export function isTestPath(relativePath: string): boolean {
  const n = normalizeRel(relativePath);
  return (
    /(^|\/)tst\//i.test(n) ||
    /(^|\/)tests?\//i.test(n) ||
    /\/__tests__\//i.test(n) ||
    /\.(test|spec)\.[jt]sx?$/i.test(n) ||
    /\.(test|spec)\.(py|go|java|kt|rs)$/i.test(n)
  );
}

function setwinLayout(mode: "setwin" | "existing", withScaffold: boolean): TestLayout {
  return {
    mode,
    unitDir: SETWIN_UNIT,
    intDir: SETWIN_INT,
    intApiDir: SETWIN_INT_API,
    intUiDir: SETWIN_INT_UI,
    guidance: [
      "Test layout (SETwin canonical):",
      `- Unit tests → ${SETWIN_UNIT}/…`,
      `- Integration tests → ${SETWIN_INT}/…`,
      `  - API integration → ${SETWIN_INT_API}/…`,
      `  - UI integration → ${SETWIN_INT_UI}/…`,
      "Do not colocate *.test.ts next to source unless this repo already does that.",
    ].join("\n"),
    scaffoldFiles: withScaffold
      ? [
          { path: `${SETWIN_UNIT}/.gitkeep`, content: GITKEEP },
          { path: `${SETWIN_INT_API}/.gitkeep`, content: GITKEEP },
          { path: `${SETWIN_INT_UI}/.gitkeep`, content: GITKEEP },
        ]
      : [],
  };
}

/**
 * Prefer an existing test tree when the repo already has one; otherwise use
 * SETwin's tst/unit + tst/int/{api,ui} layout (and scaffold empty dirs).
 */
export async function resolveTestLayout(input: {
  repoPath: string;
  existingRelativePaths?: string[];
}): Promise<TestLayout> {
  const files = (input.existingRelativePaths ?? []).map(normalizeRel);
  const root = input.repoPath.trim();

  // Explicit filesystem dirs win even if not yet in the snapshot list.
  const hasTst =
    hasPrefix(files, "tst") ||
    (root ? await dirExists(path.join(root, "tst")) : false);

  if (hasTst) {
    const unitDir =
      hasPrefix(files, "tst/unit") || (root && (await dirExists(path.join(root, SETWIN_UNIT))))
        ? SETWIN_UNIT
        : hasPrefix(files, "tst")
          ? "tst"
          : SETWIN_UNIT;
    const intApi =
      hasPrefix(files, "tst/int/api") || (root && (await dirExists(path.join(root, SETWIN_INT_API))))
        ? SETWIN_INT_API
        : hasPrefix(files, "tst/int")
          ? "tst/int"
          : SETWIN_INT_API;
    const intUi =
      hasPrefix(files, "tst/int/ui") || (root && (await dirExists(path.join(root, SETWIN_INT_UI))))
        ? SETWIN_INT_UI
        : SETWIN_INT_UI;
    const missingScaffold: Array<{ path: string; content: string }> = [];
    for (const dir of [SETWIN_UNIT, SETWIN_INT_API, SETWIN_INT_UI]) {
      const exists =
        hasPrefix(files, dir) || (root ? await dirExists(path.join(root, dir)) : false);
      if (!exists) {
        missingScaffold.push({ path: `${dir}/.gitkeep`, content: GITKEEP });
      }
    }
    return {
      mode: "existing",
      unitDir,
      intDir: SETWIN_INT,
      intApiDir: intApi,
      intUiDir: intUi,
      guidance: [
        "Test layout (follow existing tst/ tree):",
        `- Unit tests → ${unitDir}/…`,
        `- Integration tests → ${SETWIN_INT}/… (api → ${intApi}/…, ui → ${intUi}/…)`,
      ].join("\n"),
      scaffoldFiles: missingScaffold,
    };
  }

  const hasColocated = files.some(
    (file) =>
      /\.(test|spec)\.[jt]sx?$/i.test(file) &&
      !/(^|\/)(tst|tests?)\//i.test(file) &&
      !/\/__tests__\//i.test(file),
  );
  const hasDunder = files.some((file) => /\/__tests__\//i.test(file));
  if (hasColocated || hasDunder) {
    return {
      mode: "existing",
      unitDir: hasDunder ? "__tests__" : "(colocated next to source as *.test.*)",
      intDir: "tests/integration",
      intApiDir: "tests/integration/api",
      intUiDir: "tests/integration/ui",
      guidance: [
        "Test layout (follow existing repo convention):",
        hasDunder
          ? "- Unit tests live under __tests__/ (keep that pattern)."
          : "- Unit tests are colocated as *.test.* / *.spec.* next to source (keep that pattern).",
        "- If you add integration coverage, prefer tests/integration/api and tests/integration/ui when those folders exist; otherwise match nearby patterns.",
        "- Do not introduce a new tst/ tree when the repo already uses another convention.",
      ].join("\n"),
      scaffoldFiles: [],
    };
  }

  if (hasPrefix(files, "test") || hasPrefix(files, "tests") || (root && (await dirExists(path.join(root, "test"))))) {
    const base = hasPrefix(files, "tests") ? "tests" : "test";
    let entries: string[] = [];
    if (root) {
      try {
        entries = await readdir(path.join(root, base));
      } catch {
        entries = [];
      }
    }
    const lower = entries.map((name) => name.toLowerCase());
    const unitDir = lower.includes("unit") ? `${base}/unit` : base;
    const intBase = lower.includes("int")
      ? `${base}/int`
      : lower.includes("integration")
        ? `${base}/integration`
        : `${base}/integration`;
    return {
      mode: "existing",
      unitDir,
      intDir: intBase,
      intApiDir: `${intBase}/api`,
      intUiDir: `${intBase}/ui`,
      guidance: [
        `Test layout (follow existing ${base}/ tree):`,
        `- Unit tests → ${unitDir}/…`,
        `- Integration tests → ${intBase}/… (api / ui subfolders when adding new int coverage)`,
      ].join("\n"),
      scaffoldFiles: [],
    };
  }

  // Fresh / empty repo → create SETwin structure.
  return setwinLayout("setwin", true);
}

export function formatTestLayoutForPrompt(layout: TestLayout): string {
  return layout.guidance;
}

export function unitTestPath(layout: TestLayout, baseName: string, ext = "ts"): string {
  if (layout.mode === "existing" && layout.unitDir.startsWith("(")) {
    return `src/${baseName}.test.${ext}`;
  }
  return `${layout.unitDir.replace(/\/$/, "")}/${baseName}.test.${ext}`;
}

export function intApiTestPath(layout: TestLayout, baseName: string, ext = "ts"): string {
  return `${layout.intApiDir.replace(/\/$/, "")}/${baseName}.int.test.${ext}`;
}

export function intUiTestPath(layout: TestLayout, baseName: string, ext = "ts"): string {
  return `${layout.intUiDir.replace(/\/$/, "")}/${baseName}.int.test.${ext}`;
}
