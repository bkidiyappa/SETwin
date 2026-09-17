import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ts from "typescript";

const execFileAsync = promisify(execFile);

export type ParsedSymbol = {
  filePath: string;
  language: string;
  kind: string;
  name: string;
  startLine: number;
  endLine: number;
  signature: string;
};

export type ParsedEdge = {
  fromName: string;
  toName: string;
  edgeType: string;
  filePath: string;
};

export async function gitRevParse(repoPath: string): Promise<{ root: string; branch: string; remote: string }> {
  const root = (await execGit(repoPath, ["rev-parse", "--show-toplevel"])).trim();
  let branch = "main";
  try {
    branch = (await execGit(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  } catch {
    branch = "main";
  }
  let remote = "";
  try {
    remote = (await execGit(root, ["remote", "get-url", "origin"])).trim();
  } catch {
    remote = "";
  }
  return { root, branch, remote };
}

export async function gitDiff(repoPath: string, baseRef: string, headRef: string): Promise<string> {
  return execGit(repoPath, ["diff", "--stat", `${baseRef}...${headRef}`]);
}

export async function gitDiffNameOnly(repoPath: string, baseRef: string, headRef: string): Promise<string[]> {
  const output = await execGit(repoPath, ["diff", "--name-only", `${baseRef}...${headRef}`]);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function listSourceFiles(root: string, limit = 200): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    if (files.length >= limit) {
      return;
    }
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= limit) {
        return;
      }
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "data") {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (/\.(ts|tsx|js|jsx|py|go|java|rs)$/i.test(entry.name)) {
        files.push(full);
      }
    }
  }
  await walk(root);
  return files;
}

export async function parseFile(filePath: string, root: string): Promise<{ symbols: ParsedSymbol[]; edges: ParsedEdge[] }> {
  const relative = path.relative(root, filePath).replaceAll("\\", "/");
  const source = await readFile(filePath, "utf8");
  const language = languageFor(filePath);
  if (language === "typescript" || language === "javascript") {
    return parseTypeScriptLike(relative, source, language);
  }
  return parseGeneric(relative, source, language);
}

function languageFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") return "typescript";
  if (ext === ".js" || ext === ".jsx") return "javascript";
  if (ext === ".py") return "python";
  if (ext === ".go") return "go";
  if (ext === ".java") return "java";
  if (ext === ".rs") return "rust";
  return "text";
}

function parseTypeScriptLike(
  filePath: string,
  source: string,
  language: string,
): { symbols: ParsedSymbol[]; edges: ParsedEdge[] } {
  const kind = language === "typescript" ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, kind);
  const symbols: ParsedSymbol[] = [];
  const edges: ParsedEdge[] = [];
  const visit = (node: ts.Node, parentName?: string) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      symbols.push(symbol(filePath, language, "function", name, node, source));
      if (parentName) {
        edges.push({ fromName: parentName, toName: name, edgeType: "CONTAINS", filePath });
      }
    } else if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.text;
      symbols.push(symbol(filePath, language, "class", name, node, source));
      node.members.forEach((member) => {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
          const method = member.name.text;
          symbols.push(symbol(filePath, language, "method", `${name}.${method}`, member, source));
          edges.push({ fromName: name, toName: `${name}.${method}`, edgeType: "CONTAINS", filePath });
        }
      });
    } else if (ts.isImportDeclaration(node)) {
      const module = node.moduleSpecifier.getText(sf).replaceAll(/['"]/g, "");
      edges.push({ fromName: filePath, toName: module, edgeType: "IMPORTS", filePath });
    }
    ts.forEachChild(node, (child) => visit(child, parentName));
  };
  visit(sf);
  return { symbols, edges };
}

function parseGeneric(
  filePath: string,
  source: string,
  language: string,
): { symbols: ParsedSymbol[]; edges: ParsedEdge[] } {
  const symbols: ParsedSymbol[] = [];
  const patterns: Array<{ kind: string; regex: RegExp }> = [
    { kind: "function", regex: /(?:def|func|fn|function)\s+([A-Za-z_][\w]*)/g },
    { kind: "class", regex: /(?:class|interface|struct|type)\s+([A-Za-z_][\w]*)/g },
  ];
  const lines = source.split(/\r?\n/);
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern.regex)) {
      const name = match[1];
      const offset = match.index ?? 0;
      const startLine = source.slice(0, offset).split(/\r?\n/).length;
      symbols.push({
        filePath,
        language,
        kind: pattern.kind,
        name,
        startLine,
        endLine: Math.min(startLine + 20, lines.length),
        signature: match[0],
      });
    }
  }
  return { symbols, edges: [] };
}

function symbol(
  filePath: string,
  language: string,
  kind: string,
  name: string,
  node: ts.Node,
  source: string,
): ParsedSymbol {
  const start = source.slice(0, node.getStart()).split(/\r?\n/).length;
  const end = source.slice(0, node.getEnd()).split(/\r?\n/).length;
  return {
    filePath,
    language,
    kind,
    name,
    startLine: start,
    endLine: end,
    signature: node.getText().slice(0, 200),
  };
}

async function execGit(cwd: string, args: string[]): Promise<string> {
  const info = await stat(cwd);
  if (!info.isDirectory()) {
    throw new Error(`Not a directory: ${cwd}`);
  }
  const { stdout } = await execFileAsync("git", args, { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  return stdout.toString();
}
