import { ValidationError } from "@setwin/auth";

export function openSecantFile(title: string, gherkin: string): string {
  const name = title.trim() || "Test";
  const steps = gherkin
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(Given|When|Then|And|But)\b/i.test(line))
    .map((line) => line.replace(/^(Given|When|Then|And|But)\s+/i, "").trim())
    .filter(Boolean);
  const body = steps.length ? steps : [`Verify ${name}`];
  return [`@smoke`, `Test: ${name}`, ...body, ""].join("\n");
}

export function openSecantSlug(title: string, key: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || key.toLowerCase();
}

export function safeScriptPath(value: string): string {
  const relative = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!relative.startsWith("tests/") || !relative.endsWith(".test") || relative.split("/").includes("..")) {
    throw new ValidationError("Choose an OpenSecant .test file under tests/");
  }
  return relative;
}
