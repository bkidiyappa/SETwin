import { completeViaGateway, extractJsonObject, requireAiCompletion, stripModelReasoning } from "@setwin/ai";
import { recordAuditEvent } from "@setwin/audit";
import { ValidationError, type Principal } from "@setwin/auth";
import {
  applyProposedChanges,
  formatTechStackForPrompt,
  formatTestLayoutForPrompt,
  listRepositories,
  resolveTechStack,
  resolveTestLayout,
  snapshotRepositoryFiles,
  type ProposedFileChange,
} from "@setwin/repo";
import {
  createArtifact,
  createArtifactVersion,
  createGherkin,
  createRelationship,
  getArtifact,
  getProject,
  listRelationships,
  parseGherkin,
  transitionWorkflow,
  type ArtifactRecord,
  type ArtifactType,
} from "@setwin/twin";
import { buildRoleSystemPrompt, roleForArtifactType } from "./skills.ts";

export type FollowOnKind = "design" | "architecture" | "code" | "tests";

const FOLLOW_ON: Record<
  FollowOnKind,
  { role: string; task: string; type: ArtifactType; relationship: "DESIGNED_BY" | "IMPLEMENTS" | "TESTED_BY" }
> = {
  design: {
    role: "architect",
    task: "propose_architecture",
    type: "DESIGN",
    relationship: "DESIGNED_BY",
  },
  architecture: {
    role: "architect",
    task: "propose_architecture",
    type: "ARCHITECTURE",
    relationship: "DESIGNED_BY",
  },
  code: { role: "developer", task: "propose_implementation", type: "CODE", relationship: "IMPLEMENTS" },
  tests: { role: "qe", task: "requirement_to_tests", type: "GHERKIN", relationship: "TESTED_BY" },
};

export async function saveArtifactDraft(
  databaseUrl: string,
  input: { key: string; title?: string; content: string },
  actor?: Principal,
): Promise<ArtifactRecord> {
  const content = input.content.trim();
  if (!content) {
    throw new ValidationError("Content is required");
  }
  const current = await getArtifact(databaseUrl, input.key, actor);
  const state = current.currentVersion.workflowState;
  if (state === "IN_REVIEW") {
    throw new ValidationError("Cannot edit while IN_REVIEW. Approve, reject, or request changes first.");
  }
  if (state === "APPROVED") {
    // New DRAFT version after approval is allowed by createArtifactVersion.
  }
  return createArtifactVersion(
    databaseUrl,
    input.key,
    {
      title: input.title?.trim() || current.currentVersion.title,
      content,
      provenanceSource: "HUMAN_AUTHORED",
    },
    actor,
  );
}

export async function submitArtifactForReview(
  databaseUrl: string,
  key: string,
  actor?: Principal,
  options?: { comment?: string; featureKey?: string },
): Promise<ArtifactRecord> {
  const current = await getArtifact(databaseUrl, key, actor);
  const comment = options?.comment;
  const featureKey = options?.featureKey?.trim().toUpperCase();

  if (current.type === "STORY") {
    if (!featureKey) {
      throw new ValidationError("Stories must be attached to a Feature before submit (featureKey is required)");
    }
    const feature = await getArtifact(databaseUrl, featureKey, actor);
    if (feature.type !== "FEATURE") {
      throw new ValidationError(`${featureKey} is not a FEATURE`);
    }
    if (feature.projectKey !== current.projectKey) {
      throw new ValidationError("Feature and story must belong to the same project");
    }
    try {
      await createRelationship(
        databaseUrl,
        {
          from: feature.key,
          to: current.key,
          type: "CONTAINS",
          source: "HUMAN",
        },
        actor,
      );
    } catch {
      // already linked
    }
  }

  await transitionWorkflow(databaseUrl, key, "submit", actor, comment);
  return getArtifact(databaseUrl, key, actor);
}

/** Resolve Feature + sibling stories for LLM context (from a story, design, or other linked artifact). */
export async function resolveFeatureBundle(
  databaseUrl: string,
  seedKeys: string[],
  actor?: Principal,
): Promise<{ feature: ArtifactRecord | null; stories: ArtifactRecord[]; seeds: ArtifactRecord[] }> {
  const seeds: ArtifactRecord[] = [];
  for (const key of seedKeys) {
    seeds.push(await getArtifact(databaseUrl, key, actor));
  }

  let feature: ArtifactRecord | null = null;
  const storyMap = new Map<string, ArtifactRecord>();

  for (const seed of seeds) {
    if (seed.type === "FEATURE") {
      feature = seed;
    }
    if (seed.type === "STORY") {
      storyMap.set(seed.key, seed);
    }
    const rels = await listRelationships(databaseUrl, seed.key, actor);
    for (const rel of rels) {
      if (rel.type === "CONTAINS") {
        try {
          const from = await getArtifact(databaseUrl, rel.fromKey, actor);
          const to = await getArtifact(databaseUrl, rel.toKey, actor);
          if (from.type === "FEATURE") {
            feature = from;
          }
          if (to.type === "STORY") {
            storyMap.set(to.key, to);
          }
          if (from.type === "STORY") {
            storyMap.set(from.key, from);
          }
        } catch {
          // ignore
        }
      }
    }
  }

  if (feature) {
    const rels = await listRelationships(databaseUrl, feature.key, actor);
    for (const rel of rels) {
      if (rel.type !== "CONTAINS") {
        continue;
      }
      const otherKey = rel.fromKey === feature.key ? rel.toKey : rel.fromKey;
      try {
        const other = await getArtifact(databaseUrl, otherKey, actor);
        if (other.type === "STORY") {
          storyMap.set(other.key, other);
        }
      } catch {
        // ignore
      }
    }
  }

  const stories = [...storyMap.values()].sort((a, b) =>
    a.key.localeCompare(b.key, undefined, { numeric: true }),
  );
  return { feature, stories, seeds };
}

function formatBundleContext(bundle: {
  feature: ArtifactRecord | null;
  stories: ArtifactRecord[];
  seeds: ArtifactRecord[];
}): string {
  const body = (text: string) => stripModelReasoning(text);
  const parts: string[] = [];
  if (bundle.feature) {
    parts.push(
      `## Feature ${bundle.feature.key}: ${body(bundle.feature.currentVersion.title)}\n${body(bundle.feature.currentVersion.content)}`,
    );
  }
  if (bundle.stories.length) {
    parts.push("## Stories in this feature");
    for (const story of bundle.stories) {
      parts.push(
        `### ${story.key} (${story.currentVersion.workflowState}) ${body(story.currentVersion.title)}\n${body(story.currentVersion.content)}`,
      );
    }
  }
  parts.push("## Primary source artifacts (advance trigger)");
  for (const seed of bundle.seeds) {
    parts.push(
      `### ${seed.key} (${seed.type}) ${body(seed.currentVersion.title)}\n${body(seed.currentVersion.content)}`,
    );
  }
  return parts.join("\n\n");
}

/** After reject / changes_requested: role agent revises DRAFT from the reason. Optionally re-submit. */
export async function reviseArtifactFromRejection(
  databaseUrl: string,
  input: { key: string; reason: string; resubmit?: boolean; role?: string; taskId?: string },
  actor?: Principal,
): Promise<ArtifactRecord & { aiStatus: string; aiError?: string; resubmitted: boolean }> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new ValidationError("Rejection / change reason is required");
  }
  const current = await getArtifact(databaseUrl, input.key, actor);
  const state = current.currentVersion.workflowState;
  if (state !== "REJECTED" && state !== "CHANGES_REQUESTED" && state !== "DRAFT") {
    throw new ValidationError(
      `Artifact must be REJECTED, CHANGES_REQUESTED, or DRAFT to revise (was ${state})`,
    );
  }
  const role = input.role ?? roleForArtifactType(current.type);
  const taskId = input.taskId ?? "respond_to_approval_feedback";
  const ai = requireAiCompletion(
    await completeViaGateway(
      databaseUrl,
      {
        task: "artifact.revise",
        system: buildRoleSystemPrompt(role, taskId),
        prompt: [
          `Artifact ${current.key} (${current.type}) title: ${current.currentVersion.title}`,
          "Current body:",
          current.currentVersion.content,
          "",
          "Rejection / change-request reason:",
          reason,
          "",
          "Write the revised artifact body only (optionally keep a short title on the first line).",
        ].join("\n"),
      },
      actor,
    ),
    "artifact.revise",
  );
  let text = ai.text.trim();
  const fenced = text.match(/```(?:markdown|text|gherkin)?\s*([\s\S]*?)```/i);
  if (fenced) {
    text = fenced[1].trim();
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const maybeTitle = lines[0]?.replace(/^#+\s*/, "").trim();
  const useTitle =
    maybeTitle && maybeTitle.length <= 120 && lines.length > 1 ? maybeTitle : current.currentVersion.title;
  const body =
    maybeTitle && maybeTitle.length <= 120 && lines.length > 1
      ? lines.slice(1).join("\n").trim() || text
      : text;

  let updated = await createArtifactVersion(
    databaseUrl,
    current.key,
    {
      title: useTitle,
      content: body,
      provenanceSource: "AI_INFERRED",
    },
    actor,
  );

  let resubmitted = false;
  if (input.resubmit) {
    await transitionWorkflow(databaseUrl, current.key, "submit", actor, `Resubmit after addressing: ${reason}`);
    updated = await getArtifact(databaseUrl, current.key, actor);
    resubmitted = true;
  }

  await recordAuditEvent(databaseUrl, {
    action: "artifact.revise_from_rejection",
    entityType: "artifact",
    entityId: updated.id,
    entityKey: updated.key,
    version: updated.currentVersion.version,
    after: { role, aiStatus: "ok", resubmitted },
    actor,
  });

  return { ...updated, aiStatus: "ok", resubmitted };
}

/** Generate design / architecture / code / tests DRAFT(s) linked to source artifacts (many-to-many). */
export async function proposeFollowOnArtifacts(
  databaseUrl: string,
  input: {
    project: string;
    sourceKeys: string[];
    kind: FollowOnKind;
    /** When true (default for pipeline), every source must be APPROVED. */
    requireApproved?: boolean;
  },
  actor?: Principal,
): Promise<Array<ArtifactRecord & { aiStatus: string; aiError?: string; reused?: boolean }>> {
  if (!input.sourceKeys.length) {
    throw new ValidationError("sourceKeys are required");
  }
  const kind = FOLLOW_ON[input.kind];
  if (!kind) {
    throw new ValidationError(`Unknown follow-on kind: ${input.kind}`);
  }
  const requireApproved = input.requireApproved !== false;
  const sources: ArtifactRecord[] = [];
  for (const key of input.sourceKeys) {
    const row = await getArtifact(databaseUrl, key, actor);
    if (requireApproved && row.currentVersion.workflowState !== "APPROVED") {
      throw new ValidationError(
        `Cannot advance to ${kind.type}: ${row.key} is ${row.currentVersion.workflowState}, must be APPROVED`,
      );
    }
    sources.push(row);
  }

  // Reuse: if a target-type artifact already links to all sources, return it instead of creating.
  const candidateKeys = new Set<string>();
  for (const source of sources) {
    const rels = await listRelationships(databaseUrl, source.key, actor);
    for (const rel of rels) {
      const other = rel.fromKey === source.key ? rel.toKey : rel.fromKey;
      candidateKeys.add(other);
    }
  }
  for (const key of candidateKeys) {
    try {
      const existing = await getArtifact(databaseUrl, key, actor);
      if (existing.type !== kind.type) {
        continue;
      }
      const rels = await listRelationships(databaseUrl, existing.key, actor);
      const linked = new Set(rels.flatMap((rel) => [rel.fromKey, rel.toKey]));
      if (sources.every((source) => linked.has(source.key))) {
        return [{ ...existing, aiStatus: "reused", reused: true }];
      }
    } catch {
      // skip
    }
  }

  const bundle = await resolveFeatureBundle(databaseUrl, input.sourceKeys, actor);
  const context = formatBundleContext(bundle);

  if (input.kind === "code") {
    return [
      await proposeCodeIntoRepository(databaseUrl, {
        project: input.project,
        sources,
        context,
        actor,
      }),
    ];
  }

  const ai = requireAiCompletion(
    await completeViaGateway(
      databaseUrl,
      {
        task: `artifact.${input.kind}`,
        system: buildRoleSystemPrompt(kind.role, kind.task),
        prompt: [
          `Project: ${input.project}`,
          `Produce one ${kind.type} DRAFT for the primary source(s): ${input.sourceKeys.join(", ")}.`,
          "Use the full Feature + all Stories context below so the draft is coherent across the feature.",
          input.kind === "design"
            ? "Call out what needs to change across the feature and its stories; structure components, interfaces, and risks."
            : "",
          input.kind === "tests"
            ? "Output Gherkin only (start with Feature:). Do not copy the design document."
            : "Output title on the first line, then the body.",
          "",
          context,
        ]
          .filter(Boolean)
          .join("\n"),
      },
      actor,
    ),
    `artifact.${input.kind}`,
  );

  let text = ai.text.trim();
  if (input.kind === "tests") {
    const gherkinFence = text.match(/```(?:gherkin)?\s*([\s\S]*?)```/i);
    if (gherkinFence) {
      text = gherkinFence[1].trim();
    }
  } else {
    const fenced = text.match(/```(?:markdown|text)?\s*([\s\S]*?)```/i);
    if (fenced) {
      text = fenced[1].trim();
    }
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines[0]?.replace(/^#+\s*/, "").slice(0, 120) || `${kind.type} for ${input.sourceKeys[0]}`;
  const content =
    input.kind === "tests"
      ? text
      : lines.length > 1
        ? lines.join("\n")
        : text;

  let created: ArtifactRecord;
  if (kind.type === "GHERKIN") {
    const gherkinBody = /^Feature:/im.test(content)
      ? content
      : [
          `Feature: ${title}`,
          `  Generated for ${input.sourceKeys.join(", ")}`,
          "",
          "  Scenario: Happy path",
          "    Given the precondition is met",
          `    When the change for "${title.replaceAll('"', "'")}" is exercised`,
          "    Then the expected outcome is observed",
        ].join("\n");
    const storySource =
      bundle.stories[0] ??
      sources.find((row) => ["STORY", "REQUIREMENT", "FEATURE", "EPIC"].includes(row.type));
    const record = await createGherkin(
      databaseUrl,
      {
        project: input.project,
        content: gherkinBody,
        title: /^Feature:\s*(.+)/im.exec(gherkinBody)?.[1]?.trim().slice(0, 120) || title,
        requirement: storySource?.key,
        provenanceSource: "AI_INFERRED",
        provenanceAuthority: "SETWIN",
      },
      actor,
    );
    created = record.artifact;
  } else {
    created = await createArtifact(
      databaseUrl,
      {
        project: input.project,
        type: kind.type,
        title,
        content,
        provenanceSource: "AI_INFERRED",
        provenanceAuthority: "SETWIN",
      },
      actor,
    );
  }

  for (const source of sources) {
    try {
      await createRelationship(
        databaseUrl,
        {
          from: created.key,
          to: source.key,
          type: kind.relationship,
          source: "AI_INFERRED",
          confidence: 0.7,
        },
        actor,
      );
    } catch {
      // relationship may already exist
    }
  }

  await recordAuditEvent(databaseUrl, {
    action: "artifact.follow_on",
    entityType: "artifact",
    entityId: created.id,
    entityKey: created.key,
    version: created.currentVersion.version,
    after: { kind: input.kind, sources: input.sourceKeys, aiStatus: "ok" },
    actor,
  });

  return [{ ...created, aiStatus: "ok" }];
}

type CodeProposalJson = {
  title?: string;
  summary?: string;
  files?: Array<{ path?: string; content?: string; action?: string }>;
};

function parseCodeProposal(aiText: string): CodeProposalJson | null {
  const raw = extractJsonObject(aiText);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as CodeProposalJson;
  } catch {
    return null;
  }
}

export function formatCodeChangeArtifact(input: {
  title: string;
  summary: string;
  repoPath: string;
  applied: Array<{ path: string; action: string }>;
  diff: string;
}): string {
  const files = input.applied.map((row) => `- **${row.action}**: \`${row.path}\``).join("\n");
  return [
    `## Summary`,
    input.summary,
    "",
    `## Repository`,
    input.repoPath,
    "",
    `## Files changed`,
    files || "- (none)",
    "",
    `## Diff`,
    "```diff",
    input.diff.trim() || "# (empty diff)",
    "```",
    "",
    "<!-- setwin-code-change -->",
    "```json",
    JSON.stringify(
      {
        repoPath: input.repoPath,
        files: input.applied,
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

export function parseCodeChangeArtifact(content: string): {
  summary: string;
  repoPath: string;
  files: Array<{ path: string; action: string }>;
  diff: string;
} | null {
  if (!content.includes("setwin-code-change") && !content.includes("## Diff")) {
    return null;
  }
  const summary = content.match(/## Summary\s*\n([\s\S]*?)(?=\n## )/i)?.[1]?.trim() ?? "";
  const repoPath = content.match(/## Repository\s*\n([^\n]+)/i)?.[1]?.trim() ?? "";
  const diff = content.match(/## Diff\s*\n```diff\s*([\s\S]*?)```/i)?.[1]?.trim() ?? "";
  let files: Array<{ path: string; action: string }> = [];
  const meta = content.match(/<!-- setwin-code-change -->\s*```json\s*([\s\S]*?)```/i);
  if (meta) {
    try {
      const parsed = JSON.parse(meta[1]) as { files?: Array<{ path: string; action: string }> };
      files = parsed.files ?? [];
    } catch {
      files = [];
    }
  }
  if (!files.length) {
    const fileBlock = content.match(/## Files changed\s*\n([\s\S]*?)(?=\n## )/i)?.[1] ?? "";
    for (const line of fileBlock.split(/\r?\n/)) {
      const match = line.match(/\*\*(add|modify)\*\*:\s*`([^`]+)`/i);
      if (match) {
        files.push({ action: match[1].toLowerCase(), path: match[2] });
      }
    }
  }
  return { summary, repoPath, files, diff };
}

async function findLinkedArtifacts(
  databaseUrl: string,
  sourceKeys: string[],
  types: ArtifactType[],
  actor?: Principal,
): Promise<ArtifactRecord[]> {
  const found = new Map<string, ArtifactRecord>();
  const typeSet = new Set(types);
  for (const key of sourceKeys) {
    const rels = await listRelationships(databaseUrl, key, actor);
    for (const rel of rels) {
      const otherKey = rel.fromKey.toUpperCase() === key.toUpperCase() ? rel.toKey : rel.fromKey;
      try {
        const artifact = await getArtifact(databaseUrl, otherKey, actor);
        if (typeSet.has(artifact.type as ArtifactType)) {
          found.set(artifact.key, artifact);
        }
      } catch {
        // ignore
      }
    }
  }
  return [...found.values()].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

function shouldReuseWithoutRegen(artifact: ArtifactRecord): boolean {
  const state = artifact.currentVersion.workflowState;
  return state === "IN_REVIEW" || state === "APPROVED";
}

async function proposeCodeIntoRepository(
  databaseUrl: string,
  input: {
    project: string;
    sources: ArtifactRecord[];
    context: string;
    existing?: ArtifactRecord | null;
    actor?: Principal;
  },
): Promise<ArtifactRecord & { aiStatus: string; aiError?: string; reused?: boolean; submitted?: boolean }> {
  if (input.existing && shouldReuseWithoutRegen(input.existing)) {
    return { ...input.existing, aiStatus: "reused", reused: true, submitted: input.existing.currentVersion.workflowState === "IN_REVIEW" };
  }

  const repos = await listRepositories(databaseUrl, input.actor, { project: input.project });
  if (!repos.length) {
    throw new ValidationError(
      `No repository registered for project ${input.project}. Open Setup, register a product repo, then retry â†’ Code+Tests.`,
    );
  }
  const repo = repos[0]!;
  const snapshot = await snapshotRepositoryFiles(
    databaseUrl,
    { project: input.project, repositoryId: repo.id, limit: 36 },
    input.actor,
  );
  const projectRow = await getProject(databaseUrl, input.project, input.actor);
  const techStack = await resolveTechStack({
    repoPath: repo.path,
    projectTechStack: projectRow.techStack,
  });
  const techStackBlock = formatTechStackForPrompt(techStack);
  const testLayout = await resolveTestLayout({
    repoPath: repo.path,
    existingRelativePaths: snapshot.files.map((file) => file.path),
  });
  const testLayoutBlock = formatTestLayoutForPrompt(testLayout);
  const existingFilesBlock = snapshot.files.length
    ? snapshot.files
        .map(
          (file) =>
            `### ${file.path}${file.isTest ? " (test)" : ""}\n\`\`\`\n${file.excerpt}\n\`\`\``,
        )
        .join("\n\n")
    : "(repository has no indexed source files yet — treat as empty; follow project tech stack + SETwin test layout)";

  const priorCode = input.existing
    ? `\n## Existing CODE artifact ${input.existing.key}\n${input.existing.currentVersion.content.slice(0, 4000)}\n`
    : "";

  const ai = requireAiCompletion(
    await completeViaGateway(
      databaseUrl,
      {
        task: "artifact.code",
        system: buildRoleSystemPrompt("developer", "propose_implementation"),
        prompt: [
          `Project: ${input.project}`,
          `Registered repository root: ${repo.path}`,
          "",
          "## Tech stack (detect repo first; use project settings when repo is empty)",
          techStackBlock,
          "",
          "## Test directory layout",
          testLayoutBlock,
          "",
          "Reuse existing source/test files when they still fit. Modify when needed. Add only when missing.",
          "For every production add/modify include unit tests under the unit dir above.",
          "When the change needs API or UI integration coverage, add tests under the int/api or int/ui dirs (not under unit).",
          "If the repo is empty / fresh, create the tst/unit and tst/int/{api,ui} structure (scaffold .gitkeep is OK).",
          "If the repo already has another test convention, follow that convention — do not invent a second tree.",
          "Match the tech stack above for languages, frameworks, package layout, and test style.",
          "Return JSON only with title, summary, and files[{path,content,action}].",
          "",
          input.context,
          priorCode,
          "## Existing repository files (excerpts)",
          existingFilesBlock,
        ].join("\n"),
      },
      input.actor,
    ),
    "artifact.code",
  );

  const parsed = parseCodeProposal(ai.text);
  let files: ProposedFileChange[] = (parsed?.files ?? [])
    .filter((row) => row.path?.trim() && typeof row.content === "string")
    .map((row) => ({
      path: row.path!.trim(),
      content: row.content!,
      action: row.action === "modify" ? "modify" : "add",
    }));

  // applyProposedChanges detects add vs modify from disk.
  for (const file of files) {
    delete file.action;
  }

  if (!files.length && input.existing) {
    let record = input.existing;
    let submitted = false;
    if (record.currentVersion.workflowState === "DRAFT") {
      record = await submitArtifactForReview(databaseUrl, record.key, input.actor, {
        comment: "Auto-submitted for code review (existing implementation reused; no file changes)",
      });
      submitted = true;
    }
    return {
      ...record,
      aiStatus: "reused",
      reused: true,
      submitted,
    };
  }

  if (!files.length) {
    throw new ValidationError(
      "LLM unavailable for artifact.code: model did not return file JSON (title/summary/files). Task not completed.",
    );
  }

  // Ensure fresh SETwin tst/ tree exists when scaffolding an empty repo.
  if (testLayout.scaffoldFiles.length) {
    const existingPaths = new Set(files.map((file) => file.path.replaceAll("\\", "/")));
    for (const scaffold of testLayout.scaffoldFiles) {
      if (!existingPaths.has(scaffold.path)) {
        files.push({ path: scaffold.path, content: scaffold.content });
      }
    }
  }

  const applied = await applyProposedChanges(
    databaseUrl,
    {
      project: input.project,
      repositoryId: repo.id,
      files,
      summary: parsed?.summary,
    },
    input.actor,
  );

  const title = (parsed?.title || `Code for ${input.sources[0]?.key ?? input.project}`).slice(0, 120);
  const summary =
    parsed?.summary?.trim() ||
    `Applied ${applied.applied.length} file change(s) in ${applied.repoPath} (working tree, uncommitted).`;
  const content = formatCodeChangeArtifact({
    title,
    summary,
    repoPath: applied.repoPath,
    applied: applied.applied,
    diff: applied.diff,
  });

  let record: ArtifactRecord;
  if (input.existing) {
    record = await createArtifactVersion(
      databaseUrl,
      input.existing.key,
      {
        title,
        content,
        provenanceSource: "AI_INFERRED",
      },
      input.actor,
    );
  } else {
    record = await createArtifact(
      databaseUrl,
      {
        project: input.project,
        type: "CODE",
        title,
        content,
        provenanceSource: "AI_INFERRED",
        provenanceAuthority: "SETWIN",
      },
      input.actor,
    );
  }

  for (const source of input.sources) {
    try {
      await createRelationship(
        databaseUrl,
        {
          from: record.key,
          to: source.key,
          type: "IMPLEMENTS",
          source: "AI_INFERRED",
          confidence: 0.7,
        },
        input.actor,
      );
    } catch {
      // ignore
    }
  }

  let submitted = false;
  if (record.currentVersion.workflowState === "DRAFT") {
    record = await submitArtifactForReview(databaseUrl, record.key, input.actor, {
      comment: "Auto-submitted for code review with summary + diff",
    });
    submitted = true;
  }

  await recordAuditEvent(databaseUrl, {
    action: "artifact.follow_on",
    entityType: "artifact",
    entityId: record.id,
    entityKey: record.key,
    version: record.currentVersion.version,
    after: {
      kind: "code",
      sources: input.sources.map((row) => row.key),
      aiStatus: "ok",
      files: applied.applied,
      repoPath: applied.repoPath,
      submitted,
      updated: Boolean(input.existing),
    },
    actor: input.actor,
  });

  return {
    ...record,
    aiStatus: "ok",
    submitted,
  };
}


function formatScenarioDocument(
  featureName: string,
  featureDescription: string,
  scenario: { keyword: string; name: string; steps: Array<{ keyword: string; text: string }> },
  background?: { name: string; steps: Array<{ keyword: string; text: string }> },
): { title: string; content: string } {
  const lines: string[] = [`Feature: ${featureName}`];
  if (featureDescription.trim()) {
    for (const line of featureDescription.trim().split(/\r?\n/)) {
      lines.push(`  ${line}`);
    }
  }
  lines.push("");
  if (background && background.steps.length) {
    lines.push(`  Background:${background.name ? ` ${background.name}` : ""}`);
    for (const step of background.steps) {
      const kw = step.keyword.endsWith(" ") ? step.keyword : `${step.keyword} `;
      lines.push(`    ${kw}${step.text}`);
    }
    lines.push("");
  }
  const keyword = /outline/i.test(scenario.keyword) ? "Scenario Outline" : "Scenario";
  lines.push(`  ${keyword}: ${scenario.name}`);
  for (const step of scenario.steps) {
    const kw = step.keyword.endsWith(" ") ? step.keyword : `${step.keyword} `;
    lines.push(`    ${kw}${step.text}`);
  }
  return { title: scenario.name.slice(0, 120) || "Scenario", content: lines.join("\n") };
}

function fallbackGherkinDocs(featureTitle: string): Array<{ title: string; content: string }> {
  const name = featureTitle.trim() || "Acceptance";
  return [
    {
      title: "Happy path",
      content: [
        `Feature: ${name}`,
        "",
        "  Scenario: Happy path",
        "    Given the precondition is met",
        "    When the primary action occurs",
        "    Then the expected outcome is observed",
      ].join("\n"),
    },
    {
      title: "Negative path",
      content: [
        `Feature: ${name}`,
        "",
        "  Scenario: Negative path",
        "    Given the precondition is met",
        "    When an invalid action occurs",
        "    Then an error is shown",
      ].join("\n"),
    },
  ];
}

function isValidGherkinDoc(content: string): boolean {
  try {
    parseGherkin(content);
    return true;
  } catch {
    return false;
  }
}

/** Split a multi-scenario Feature into one Feature document per Scenario. */
export function splitGherkinScenarios(source: string): Array<{ title: string; content: string }> {
  const parsed = parseGherkin(source);
  const background = parsed.scenarios.find((row) => /background/i.test(row.keyword));
  const scenarios = parsed.scenarios.filter((row) => !/background/i.test(row.keyword));
  if (!scenarios.length) {
    return fallbackGherkinDocs(parsed.name);
  }
  return scenarios.map((scenario) =>
    formatScenarioDocument(parsed.name, parsed.description, scenario, background),
  );
}

function countGherkinScenarios(content: string): number {
  try {
    return splitGherkinScenarios(content).length;
  } catch {
    return (content.match(/^\s*Scenario(?: Outline)?:/gim) ?? []).length || 1;
  }
}

/**
 * When an existing TST packs multiple Scenarios into one artifact, expand into
 * one twin artifact per Scenario (first keeps the original key).
 */
async function expandPackedGherkinArtifacts(
  databaseUrl: string,
  input: {
    project: string;
    sources: ArtifactRecord[];
    existing: ArtifactRecord[];
    actor?: Principal;
  },
): Promise<Array<ArtifactRecord & { aiStatus: string; aiError?: string; reused?: boolean }> | null> {
  const packed = input.existing.filter((row) => countGherkinScenarios(row.currentVersion.content) > 1);
  if (!packed.length) {
    return null;
  }

  const bundleStories = (await resolveFeatureBundle(databaseUrl, input.sources.map((s) => s.key), input.actor)).stories;
  const requirementKey =
    bundleStories[0]?.key ??
    input.sources.find((row) => ["STORY", "REQUIREMENT", "FEATURE", "EPIC"].includes(row.type))?.key;

  const results: Array<ArtifactRecord & { aiStatus: string; aiError?: string; reused?: boolean }> = [];
  const skip = new Set(packed.map((row) => row.key));

  for (const row of input.existing) {
    if (!skip.has(row.key)) {
      results.push({ ...row, aiStatus: "reused", reused: true });
      continue;
    }

    let docs: Array<{ title: string; content: string }>;
    try {
      docs = splitGherkinScenarios(row.currentVersion.content);
    } catch {
      results.push({ ...row, aiStatus: "reused", reused: true });
      continue;
    }

    for (let index = 0; index < docs.length; index++) {
      const doc = docs[index]!;
      if (index === 0) {
        const updated =
          row.currentVersion.content.trim() === doc.content.trim() &&
          row.currentVersion.title.trim() === doc.title.trim()
            ? row
            : await createArtifactVersion(
                databaseUrl,
                row.key,
                {
                  title: doc.title,
                  content: doc.content,
                  provenanceSource: "AI_INFERRED",
                },
                input.actor,
              );
        results.push({ ...updated, aiStatus: "split", reused: false });
        continue;
      }

      const created = await createGherkin(
        databaseUrl,
        {
          project: input.project,
          content: doc.content,
          title: doc.title,
          requirement: requirementKey,
          provenanceSource: "AI_INFERRED",
          provenanceAuthority: "SETWIN",
        },
        input.actor,
      );
      for (const source of input.sources) {
        try {
          await createRelationship(
            databaseUrl,
            {
              from: created.artifact.key,
              to: source.key,
              type: "TESTED_BY",
              source: "AI_INFERRED",
              confidence: 0.7,
            },
            input.actor,
          );
        } catch {
          // ignore
        }
      }
      results.push({ ...created.artifact, aiStatus: "split", reused: false });
    }
  }

  const byKey = new Map(results.map((row) => [row.key, row]));
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

async function proposeOrUpdateGherkin(
  databaseUrl: string,
  input: {
    project: string;
    sources: ArtifactRecord[];
    context: string;
    existing?: ArtifactRecord[];
    actor?: Principal;
  },
): Promise<Array<ArtifactRecord & { aiStatus: string; aiError?: string; reused?: boolean }>> {
  const existing = input.existing ?? [];

  // Older runs packed many Scenarios into one TST — split first (no LLM).
  if (existing.some((row) => countGherkinScenarios(row.currentVersion.content) > 1)) {
    const expanded = await expandPackedGherkinArtifacts(databaseUrl, {
      project: input.project,
      sources: input.sources,
      existing,
      actor: input.actor,
    });
    if (expanded) {
      return expanded;
    }
  }

  if (existing.length && existing.every((row) => shouldReuseWithoutRegen(row))) {
    return existing.map((row) => ({ ...row, aiStatus: "reused", reused: true }));
  }

  const existingBlock = existing.length
    ? existing
        .map(
          (row) =>
            `### ${row.key} (${row.currentVersion.workflowState}) ${row.currentVersion.title}\n\`\`\`gherkin\n${row.currentVersion.content}\n\`\`\``,
        )
        .join("\n\n")
    : "(none — create new scenarios)";

  const ai = requireAiCompletion(
    await completeViaGateway(
      databaseUrl,
      {
        task: "artifact.tests",
        system: buildRoleSystemPrompt("qe", "requirement_to_tests"),
        prompt: [
          `Project: ${input.project}`,
          "Produce one Gherkin Feature with multiple Scenarios (happy path + edge/negative).",
          "Each Scenario will be stored as its own twin test artifact — use clear distinct Scenario names.",
          "Reuse/adapt existing scenarios when still valid; otherwise modify or add.",
          "Output Gherkin only (start with Feature:).",
          "",
          input.context,
          "",
          "## Existing Gherkin tests",
          existingBlock,
        ].join("\n"),
      },
      input.actor,
    ),
    "artifact.tests",
  );

  let text = ai.text.trim();
  const gherkinFence = text.match(/```(?:gherkin)?\s*([\s\S]*?)```/i);
  if (gherkinFence) {
    text = gherkinFence[1].trim();
  }
  const featureAt = text.search(/^\s*Feature\s*:/im);
  if (featureAt > 0) {
    text = text.slice(featureAt).trim();
  }
  const featureTitle = input.sources[0]?.currentVersion.title ?? "Acceptance";
  if (text && !/^Feature:/im.test(text)) {
    text = `Feature: ${featureTitle}\n${text}`;
  }
  // Strip markdown bold accidentally put in Feature titles (breaks clean Gherkin).
  text = text.replace(/^(\s*Feature:\s*)\*+([^*]+)\*+/im, "$1$2");

  let scenarioDocs: Array<{ title: string; content: string }>;
  try {
    scenarioDocs = text ? splitGherkinScenarios(text) : [];
  } catch {
    scenarioDocs = [];
  }
  scenarioDocs = scenarioDocs.filter((doc) => isValidGherkinDoc(doc.content));
  if (!scenarioDocs.length) {
    throw new ValidationError(
      "LLM unavailable for artifact.tests: model did not return valid Gherkin scenarios. Task not completed.",
    );
  }
  // Always land at least happy + negative as separate TST artifacts when the model under-produces.
  if (scenarioDocs.length < 2) {
    const titles = new Set(scenarioDocs.map((doc) => doc.title.trim().toLowerCase()));
    for (const doc of fallbackGherkinDocs(featureTitle)) {
      if (!titles.has(doc.title.trim().toLowerCase()) && isValidGherkinDoc(doc.content)) {
        scenarioDocs.push(doc);
        titles.add(doc.title.trim().toLowerCase());
      }
    }
  }

  const bundleStories = (await resolveFeatureBundle(databaseUrl, input.sources.map((s) => s.key), input.actor)).stories;
  const requirementKey =
    bundleStories[0]?.key ??
    input.sources.find((row) => ["STORY", "REQUIREMENT", "FEATURE", "EPIC"].includes(row.type))?.key;

  const locked = existing.filter((row) => shouldReuseWithoutRegen(row));
  const editableExisting = existing.filter((row) => !shouldReuseWithoutRegen(row));
  const results: Array<ArtifactRecord & { aiStatus: string; aiError?: string; reused?: boolean }> = locked.map(
    (row) => ({ ...row, aiStatus: "reused", reused: true }),
  );
  const usedKeys = new Set(results.map((row) => row.key));

  for (let index = 0; index < scenarioDocs.length; index++) {
    const doc = scenarioDocs[index]!;
    const match =
      editableExisting.find(
        (row) =>
          !usedKeys.has(row.key) &&
          row.currentVersion.title.trim().toLowerCase() === doc.title.trim().toLowerCase(),
      ) ?? editableExisting.find((row) => !usedKeys.has(row.key));

    if (match && match.currentVersion.content.trim() === doc.content.trim()) {
      usedKeys.add(match.key);
      results.push({
        ...match,
        aiStatus: "reused",
        reused: true,
      });
      continue;
    }

    let record: ArtifactRecord;
    if (match) {
      usedKeys.add(match.key);
      record = await createArtifactVersion(
        databaseUrl,
        match.key,
        {
          title: doc.title,
          content: doc.content,
          provenanceSource: "AI_INFERRED",
        },
        input.actor,
      );
    } else {
      const created = await createGherkin(
        databaseUrl,
        {
          project: input.project,
          content: doc.content,
          title: doc.title,
          requirement: requirementKey,
          provenanceSource: "AI_INFERRED",
          provenanceAuthority: "SETWIN",
        },
        input.actor,
      );
      record = created.artifact;
      usedKeys.add(record.key);
    }

    for (const source of input.sources) {
      try {
        await createRelationship(
          databaseUrl,
          {
            from: record.key,
            to: source.key,
            type: "TESTED_BY",
            source: "AI_INFERRED",
            confidence: 0.7,
          },
          input.actor,
        );
      } catch {
        // ignore
      }
    }

    await recordAuditEvent(databaseUrl, {
      action: "artifact.follow_on",
      entityType: "artifact",
      entityId: record.id,
      entityKey: record.key,
      version: record.currentVersion.version,
      after: {
        kind: "tests",
        scenario: doc.title,
        sources: input.sources.map((row) => row.key),
        aiStatus: "ok",
        updated: Boolean(match),
      },
      actor: input.actor,
    });

    results.push({ ...record, aiStatus: "ok", reused: false });
  }

  const byKey = new Map<string, ArtifactRecord & { aiStatus: string; aiError?: string; reused?: boolean }>();
  for (const row of results) {
    byKey.set(row.key, row);
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

/**
 * From an APPROVED design: reuse/modify/add CODE (unit tests + auto code-review)
 * and one Gherkin twin artifact per Scenario.
 */
export async function syncCodeAndTestsFromDesign(
  databaseUrl: string,
  input: { project: string; designKey: string },
  actor?: Principal,
): Promise<{
  code: ArtifactRecord & { aiStatus: string; aiError?: string; reused?: boolean; submitted?: boolean };
  tests: Array<ArtifactRecord & { aiStatus: string; aiError?: string; reused?: boolean }>;
}> {
  const design = await getArtifact(databaseUrl, input.designKey, actor);
  if (design.type !== "DESIGN" && design.type !== "ARCHITECTURE") {
    throw new ValidationError(`${input.designKey} is not a Design artifact`);
  }
  if (design.currentVersion.workflowState !== "APPROVED") {
    throw new ValidationError(`Design ${design.key} must be APPROVED (was ${design.currentVersion.workflowState})`);
  }

  const bundle = await resolveFeatureBundle(databaseUrl, [design.key], actor);
  const sources = [design, ...bundle.stories];
  if (bundle.feature) {
    sources.unshift(bundle.feature);
  }
  const context = formatBundleContext(bundle);
  const sourceKeys = sources.map((row) => row.key);

  const [existingCodeList, existingTestList] = await Promise.all([
    findLinkedArtifacts(databaseUrl, sourceKeys, ["CODE"], actor),
    findLinkedArtifacts(databaseUrl, sourceKeys, ["GHERKIN", "TEST"], actor),
  ]);
  const existingCode = existingCodeList[0] ?? null;
  const existingGherkin = existingTestList.filter((row) => row.type === "GHERKIN");

  const [code, tests] = await Promise.all([
    proposeCodeIntoRepository(databaseUrl, {
      project: input.project,
      sources: [design, ...bundle.stories],
      context,
      existing: existingCode,
      actor,
    }),
    proposeOrUpdateGherkin(databaseUrl, {
      project: input.project,
      sources: [design, ...bundle.stories],
      context,
      existing: existingGherkin,
      actor,
    }),
  ]);

  return { code, tests };
}
