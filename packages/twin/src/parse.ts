import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import { IdGenerator, type FeatureChild, type Step } from "@cucumber/messages";
import { ValidationError } from "@setwin/auth";
import type { ParsedGherkinFeature, ParsedGherkinScenario, ParsedGherkinStep } from "./types.ts";

export function parseGherkin(source: string): ParsedGherkinFeature {
  const content = source.trim();
  if (!content) {
    throw new ValidationError("Gherkin content is required");
  }

  let document: ReturnType<Parser["parse"]>;
  try {
    const uuidFn = IdGenerator.uuid();
    const parser = new Parser(new AstBuilder(uuidFn), new GherkinClassicTokenMatcher());
    document = parser.parse(content);
  } catch (error) {
    throw new ValidationError(`Invalid Gherkin: ${firstErrorLine(error)}`);
  }

  const feature = document.feature;
  if (!feature?.name.trim()) {
    throw new ValidationError("Gherkin must declare a named Feature.");
  }

  const scenarios: ParsedGherkinScenario[] = [];
  collectScenarios(feature.children ?? [], scenarios);
  if (scenarios.length === 0) {
    throw new ValidationError("Gherkin Feature must contain at least one Scenario.");
  }
  for (const scenario of scenarios) {
    if (scenario.steps.length === 0) {
      throw new ValidationError(`Scenario "${scenario.name}" must contain at least one step.`);
    }
  }

  return {
    name: feature.name.trim(),
    description: feature.description?.trim() ?? "",
    language: feature.language || "en",
    scenarios,
  };
}

function collectScenarios(children: readonly FeatureChild[], scenarios: ParsedGherkinScenario[]): void {
  for (const child of children) {
    if (child.background) {
      scenarios.push({
        keyword: child.background.keyword.trim(),
        name: child.background.name.trim() || "Background",
        index: scenarios.length,
        steps: mapSteps(child.background.steps),
      });
    }
    if (child.scenario) {
      scenarios.push({
        keyword: child.scenario.keyword.trim(),
        name: child.scenario.name.trim() || "(unnamed)",
        index: scenarios.length,
        steps: mapSteps(child.scenario.steps),
      });
    }
    if (child.rule?.children) {
      collectScenarios(child.rule.children, scenarios);
    }
  }
}

function mapSteps(steps: readonly Step[] | undefined): ParsedGherkinStep[] {
  return (steps ?? []).map((step, index) => ({
    keyword: step.keyword.trim(),
    text: step.text.trim(),
    index,
  }));
}

function firstErrorLine(error: unknown): string {
  if (error && typeof error === "object" && "errors" in error && Array.isArray((error as { errors: unknown[] }).errors)) {
    const first = (error as { errors: Array<{ message?: string }> }).errors[0];
    if (first?.message) {
      return first.message.split("\n")[0] ?? "parse error";
    }
  }
  if (error instanceof Error) {
    return error.message.split("\n")[0] ?? error.message;
  }
  return String(error);
}
