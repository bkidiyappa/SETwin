import { recordAuditEvent } from "@setwin/audit";
import { completeViaGateway } from "@setwin/ai";
import { ValidationError, requirePermission, type Principal } from "@setwin/auth";
import {
  createArtifact,
  createGherkin,
  getArtifact,
  parseGherkin,
  type ArtifactRecord,
  type GherkinRecord,
} from "@setwin/twin";

export type RequirementChecks = {
  ambiguities: string[];
  businessRules: string[];
  conflicts: string[];
};

const AMBIGUITY_PATTERNS = [
  /\b(maybe|perhaps|somehow|etc\.?|and\/or|TBD|TODO|as appropriate|if needed)\b/i,
  /\b(fast|slow|quick|easy|user.?friendly|robust|secure)\b/i,
  /\b(some|several|many|few)\b/i,
];

const RULE_PATTERNS = [
  /\bmust\b/i,
  /\bshall\b/i,
  /\brequired\b/i,
  /\bwithin\s+\d+/i,
  /\bonly\b/i,
  /\bcannot\b/i,
  /\bnever\b/i,
];

export async function createRequirement(
  databaseUrl: string,
  input: { project: string; title?: string; text: string },
  actor?: Principal,
): Promise<ArtifactRecord & { checks: RequirementChecks }> {
  await requirePermission(databaseUrl, actor, "requirement:create");
  const text = input.text.trim();
  if (!text) {
    throw new ValidationError("Requirement text is required");
  }
  const title = input.title?.trim() || text.split(/[.!\n]/)[0].slice(0, 80) || "Requirement";
  const created = await createArtifact(
    databaseUrl,
    {
      project: input.project,
      type: "REQUIREMENT",
      title,
      content: text,
      provenanceSource: "HUMAN_AUTHORED",
    },
    actor,
  );
  const checks = analyzeRequirement(text);
  await recordAuditEvent(databaseUrl, {
    action: "requirement.create",
    entityType: "artifact",
    entityId: created.id,
    entityKey: created.key,
    version: 1,
    after: { title, checks },
    actor,
  });
  return { ...created, checks };
}

export async function showRequirement(
  databaseUrl: string,
  key: string,
  actor?: Principal,
): Promise<ArtifactRecord & { checks: RequirementChecks }> {
  await requirePermission(databaseUrl, actor, "requirement:view");
  const artifact = await getArtifact(databaseUrl, key, actor);
  if (artifact.type !== "REQUIREMENT") {
    throw new ValidationError(`Artifact ${key} is not a REQUIREMENT`);
  }
  return { ...artifact, checks: analyzeRequirement(artifact.currentVersion.content) };
}

export function analyzeRequirement(text: string): RequirementChecks {
  const ambiguities = AMBIGUITY_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
    `Ambiguous language matched: ${pattern.source}`,
  );
  const businessRules = RULE_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
    `Business rule cue: ${pattern.source}`,
  );
  const conflicts: string[] = [];
  if (/\bmust\b/i.test(text) && /\boptional\b/i.test(text)) {
    conflicts.push("Contains both must and optional directives");
  }
  if (/\balways\b/i.test(text) && /\bnever\b/i.test(text)) {
    conflicts.push("Contains both always and never directives");
  }
  if (/\bwithin\s+(\d+)\s*(minutes?|hours?|days?)/i.test(text)) {
    const matches = [...text.matchAll(/\bwithin\s+(\d+)\s*(minutes?|hours?|days?)/gi)];
    const values = matches.map((match) => `${match[1]} ${match[2]}`);
    if (new Set(values).size > 1) {
      conflicts.push(`Conflicting time windows: ${values.join(", ")}`);
    }
  }
  return { ambiguities, businessRules, conflicts };
}

export async function generateGherkinDraft(
  databaseUrl: string,
  key: string,
  actor?: Principal,
): Promise<{ gherkin: GherkinRecord; aiStatus: string; aiError?: string }> {
  const requirement = await showRequirement(databaseUrl, key, actor);
  const system =
    "You convert product requirements into valid Gherkin Feature files. Output only Gherkin. Do not approve anything.";
  const prompt = `Requirement ${requirement.key}: ${requirement.currentVersion.title}\n\n${requirement.currentVersion.content}\n\nWrite a Feature with at least one Scenario.`;
  const ai = await completeViaGateway(
    databaseUrl,
    { task: "gherkin.generate", prompt, system },
    actor,
  );

  let content = ai.text.trim();
  if (ai.status !== "ok" || !content) {
    content = deterministicGherkin(requirement.currentVersion.title, requirement.currentVersion.content);
  } else {
    const fenced = content.match(/```(?:gherkin)?\s*([\s\S]*?)```/i);
    if (fenced) {
      content = fenced[1].trim();
    }
  }

  // Validate; fall back to deterministic draft if the model produced invalid Gherkin.
  try {
    parseGherkin(content);
  } catch {
    content = deterministicGherkin(requirement.currentVersion.title, requirement.currentVersion.content);
  }

  const gherkin = await createGherkin(
    databaseUrl,
    {
      project: requirement.projectKey,
      content,
      requirement: requirement.key,
      provenanceSource: "AI_INFERRED",
      provenanceAuthority: "SETWIN",
    },
    actor,
  );
  await recordAuditEvent(databaseUrl, {
    action: "requirement.gherkin.generate",
    entityType: "artifact",
    entityId: gherkin.id,
    entityKey: gherkin.key,
    version: gherkin.currentVersion.version,
    after: { requirement: requirement.key, aiStatus: ai.status, draftOnly: true },
    actor,
  });
  return { gherkin, aiStatus: ai.status, aiError: ai.error };
}

function deterministicGherkin(title: string, content: string): string {
  const safeTitle = title.replaceAll('"', "'");
  return [
    `Feature: ${safeTitle}`,
    `  ${content.split("\n")[0] || "Generated from requirement"}`,
    "",
    "  Scenario: Happy path",
    "    Given the precondition is met",
    `    When the actor performs the action for "${safeTitle}"`,
    "    Then the expected outcome is observed",
  ].join("\n");
}
