import { buildRoleSystemPrompt } from "@setwin/agents";
import { recordAuditEvent } from "@setwin/audit";
import { completeViaGateway, requireAiCompletion } from "@setwin/ai";
import { ValidationError, requirePermission, type Principal } from "@setwin/auth";
import {
  createArtifact,
  createArtifactVersion,
  createGherkin,
  createRelationship,
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

export type StoryDraft = {
  title: string;
  content: string;
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
  input: { project: string; title?: string; text: string; provenanceSource?: string },
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
      provenanceSource: input.provenanceSource ?? "HUMAN_AUTHORED",
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

/** PO skill: convert a free-text prompt into one or more STORY DRAFTs. */
export async function createStoriesFromPrompt(
  databaseUrl: string,
  input: { project: string; prompt: string },
  actor?: Principal,
): Promise<{
  stories: Array<ArtifactRecord & { checks: RequirementChecks }>;
  aiStatus: string;
  aiError?: string;
  prompt: string;
}> {
  await requirePermission(databaseUrl, actor, "requirement:create");
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new ValidationError("Prompt is required");
  }
  const ai = requireAiCompletion(
    await completeViaGateway(
      databaseUrl,
      {
        task: "story.split",
        system: buildRoleSystemPrompt("product_owner", "prompt_to_stories"),
        prompt: `Project: ${input.project}\n\nStakeholder prompt:\n${prompt}\n\nReturn JSON only.`,
      },
      actor,
    ),
    "story.split",
  );

  const drafts = parseStoryDrafts(ai.text, prompt);
  if (!drafts.length) {
    throw new ValidationError("LLM unavailable for story.split: no stories parsed from model response");
  }
  const stories: Array<ArtifactRecord & { checks: RequirementChecks }> = [];

  for (const draft of drafts) {
    const created = await createArtifact(
      databaseUrl,
      {
        project: input.project,
        type: "STORY",
        title: draft.title,
        content: draft.content,
        provenanceSource: "AI_INFERRED",
        provenanceAuthority: "SETWIN",
      },
      actor,
    );
    const checks = analyzeRequirement(draft.content);
    await recordAuditEvent(databaseUrl, {
      action: "story.create",
      entityType: "artifact",
      entityId: created.id,
      entityKey: created.key,
      version: 1,
      after: { title: draft.title, checks, fromPrompt: true },
      actor,
    });
    stories.push({ ...created, checks });
  }

  // Link sibling stories as DERIVED_FROM the first when multiple exist
  if (stories.length > 1) {
    const parent = stories[0];
    for (const child of stories.slice(1)) {
      try {
        await createRelationship(
          databaseUrl,
          { from: child.key, to: parent.key, type: "DERIVED_FROM", source: "AI_INFERRED", confidence: 0.6 },
          actor,
        );
      } catch {
        // ignore link failures
      }
    }
  }

  return { stories, aiStatus: "ok", prompt };
}

export function formatStoryBody(description: string, acceptanceCriteria: string): string {
  const desc = description.trim();
  let gherkin = acceptanceCriteria.trim();
  if (gherkin && !/^Feature:/im.test(gherkin)) {
    const headline = desc.split(/[.!\n]/)[0] || "Story";
    gherkin = [
      `Feature: ${headline}`,
      "  Scenario: Acceptance",
      "    Given the precondition is met",
      "    When the described behavior occurs",
      "    Then the acceptance criteria are satisfied",
      "",
      gherkin,
    ].join("\n");
  }
  if (!gherkin) {
    const title = desc.split(/[.!\n]/)[0] || "Story";
    gherkin = [
      `Feature: ${title}`,
      "  Scenario: Happy path",
      "    Given the precondition is met",
      `    When the actor performs the action for "${title.replaceAll('"', "'")}"`,
      "    Then the expected outcome is observed",
    ].join("\n");
  }
  return ["## Description", desc, "", "## Acceptance Criteria", "", "```gherkin", gherkin, "```"].join("\n");
}

export function parseStoryDrafts(aiText: string, fallbackPrompt: string): StoryDraft[] {
  const text = aiText.trim();
  if (text) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as {
          stories?: Array<{
            title?: string;
            description?: string;
            content?: string;
            acceptanceCriteria?: string;
            acceptance_criteria?: string;
          }>;
        };
        if (Array.isArray(parsed.stories) && parsed.stories.length) {
          return parsed.stories
            .map((row) => {
              const title = (row.title || "Story").trim().slice(0, 120);
              const description = (row.description || row.content || title).trim();
              const ac = (row.acceptanceCriteria || row.acceptance_criteria || "").trim();
              return { title, content: formatStoryBody(description, ac) };
            })
            .filter((row) => row.content);
        }
      } catch {
        // fall through to markdown split
      }
    }
    const sections = text.split(/\n(?=##\s+Story\b|\n(?=\d+\.\s))/i).map((part) => part.trim()).filter(Boolean);
    if (sections.length > 1) {
      return sections.map((section, index) => {
        const lines = section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const title =
          lines[0]?.replace(/^##\s*Story\s*\d*\s*[:.-]?\s*/i, "").replace(/^\d+\.\s*/, "").slice(0, 120) ||
          `Story ${index + 1}`;
        const content = lines.slice(1).join("\n").trim() || section;
        return { title, content: formatStoryBody(content, "") };
      });
    }
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const title = lines[0]?.replace(/^#+\s*/, "").slice(0, 120) || fallbackPrompt.slice(0, 80);
    const content = lines.length > 1 ? lines.join("\n") : text;
    return [{ title, content: formatStoryBody(content, "") }];
  }
  return splitPromptHeuristically(fallbackPrompt);
}

function splitPromptHeuristically(prompt: string): StoryDraft[] {
  const parts = prompt
    .split(/\n+|;\s+|\band then\b|\balso\b/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 12);
  if (parts.length <= 1) {
    return [
      {
        title: prompt.split(/[.!\n]/)[0].slice(0, 80) || "Story",
        content: formatStoryBody(prompt, ""),
      },
    ];
  }
  return parts.map((part, index) => ({
    title: part.split(/[.!\n]/)[0].slice(0, 80) || `Story ${index + 1}`,
    content: formatStoryBody(part, ""),
  }));
}

/** @deprecated Prefer createStoriesFromPrompt — kept for CLI/API compatibility. */
export async function createRequirementFromPrompt(
  databaseUrl: string,
  input: { project: string; prompt: string },
  actor?: Principal,
): Promise<ArtifactRecord & { checks: RequirementChecks; aiStatus: string; aiError?: string }> {
  const batch = await createStoriesFromPrompt(databaseUrl, input, actor);
  const first = batch.stories[0];
  if (!first) {
    throw new ValidationError("No stories produced from prompt");
  }
  return { ...first, aiStatus: batch.aiStatus, aiError: batch.aiError };
}

export async function updateStory(
  databaseUrl: string,
  input: { key: string; title?: string; content: string },
  actor?: Principal,
): Promise<ArtifactRecord & { checks: RequirementChecks }> {
  await requirePermission(databaseUrl, actor, "requirement:create");
  const current = await getArtifact(databaseUrl, input.key, actor);
  if (current.type !== "STORY" && current.type !== "REQUIREMENT" && current.type !== "FEATURE") {
    throw new ValidationError(`Artifact ${input.key} is not an editable story/requirement`);
  }
  if (current.currentVersion.workflowState === "IN_REVIEW") {
    throw new ValidationError("Cannot edit while IN_REVIEW. Decide the review first.");
  }
  const content = input.content.trim();
  if (!content) {
    throw new ValidationError("Content is required");
  }
  const updated = await createArtifactVersion(
    databaseUrl,
    input.key,
    {
      title: input.title?.trim() || current.currentVersion.title,
      content,
      provenanceSource: "HUMAN_AUTHORED",
    },
    actor,
  );
  const checks = analyzeRequirement(content);
  await recordAuditEvent(databaseUrl, {
    action: "story.update",
    entityType: "artifact",
    entityId: updated.id,
    entityKey: updated.key,
    version: updated.currentVersion.version,
    after: { checks },
    actor,
  });
  return { ...updated, checks };
}

/** PO skill: revise a requirement/story from review / approval feedback into a new DRAFT version. */
export async function reviseRequirementFromFeedback(
  databaseUrl: string,
  input: { key: string; feedback: string },
  actor?: Principal,
): Promise<ArtifactRecord & { checks: RequirementChecks; aiStatus: string; aiError?: string }> {
  const current = await showRequirement(databaseUrl, input.key, actor);
  const feedback = input.feedback.trim();
  if (!feedback) {
    throw new ValidationError("Feedback is required");
  }
  const ai = requireAiCompletion(
    await completeViaGateway(
      databaseUrl,
      {
        task: "requirement.analyze",
        system: buildRoleSystemPrompt("product_owner", "respond_to_approval_feedback"),
        prompt: [
          `Requirement ${current.key} current title: ${current.currentVersion.title}`,
          "Current body:",
          current.currentVersion.content,
          "",
          "Review / approval feedback:",
          feedback,
          "",
          "Write the revised requirement body only.",
        ].join("\n"),
      },
      actor,
    ),
    "requirement.analyze",
  );
  let text = ai.text.trim();
  const fenced = text.match(/```(?:markdown|text)?\s*([\s\S]*?)```/i);
  if (fenced) {
    text = fenced[1].trim();
  }
  const updated = await createArtifactVersion(
    databaseUrl,
    current.key,
    {
      title: current.currentVersion.title,
      content: text,
      provenanceSource: "AI_INFERRED",
    },
    actor,
  );
  const checks = analyzeRequirement(updated.currentVersion.content);
  await recordAuditEvent(databaseUrl, {
    action: "requirement.revise_from_feedback",
    entityType: "artifact",
    entityId: updated.id,
    entityKey: updated.key,
    version: updated.currentVersion.version,
    after: { checks, aiStatus: "ok" },
    actor,
  });
  return { ...updated, checks, aiStatus: "ok" };
}

export async function showRequirement(
  databaseUrl: string,
  key: string,
  actor?: Principal,
): Promise<ArtifactRecord & { checks: RequirementChecks }> {
  await requirePermission(databaseUrl, actor, "requirement:view");
  const artifact = await getArtifact(databaseUrl, key, actor);
  if (
    artifact.type !== "REQUIREMENT" &&
    artifact.type !== "STORY" &&
    artifact.type !== "FEATURE" &&
    artifact.type !== "EPIC"
  ) {
    throw new ValidationError(`Artifact ${key} is not a REQUIREMENT/STORY`);
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
  const system = buildRoleSystemPrompt("qe", "requirement_to_tests");
  const prompt = `Story/Requirement ${requirement.key}: ${requirement.currentVersion.title}\n\n${requirement.currentVersion.content}\n\nWrite a Feature with at least one Scenario. Output only Gherkin.`;
  const ai = requireAiCompletion(
    await completeViaGateway(
      databaseUrl,
      { task: "gherkin.generate", prompt, system },
      actor,
    ),
    "gherkin.generate",
  );

  let content = ai.text.trim();
  const fenced = content.match(/```(?:gherkin)?\s*([\s\S]*?)```/i);
  if (fenced) {
    content = fenced[1].trim();
  }

  try {
    parseGherkin(content);
  } catch {
    throw new ValidationError(
      "LLM unavailable for gherkin.generate: model response was not valid Gherkin. Task not completed.",
    );
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
  const artifact = gherkin.artifact;
  if (!artifact?.currentVersion) {
    throw new ValidationError(`Gherkin create returned an incomplete artifact for ${requirement.key}`);
  }
  await recordAuditEvent(databaseUrl, {
    action: "requirement.gherkin.generate",
    entityType: "artifact",
    entityId: artifact.id,
    entityKey: artifact.key,
    version: artifact.currentVersion.version,
    after: { requirement: requirement.key, aiStatus: "ok", draftOnly: true, roleSkill: "qe" },
    actor,
  });
  return { gherkin, aiStatus: "ok" };
}
