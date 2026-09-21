import { completeViaGateway } from "@setwin/ai";
import { recordAuditEvent } from "@setwin/audit";
import { ValidationError, type Principal } from "@setwin/auth";
import {
  createArtifact,
  createArtifactVersion,
  createRelationship,
  getArtifact,
  listRelationships,
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
  tests: { role: "qe", task: "requirement_to_tests", type: "TEST", relationship: "TESTED_BY" },
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
  comment?: string,
): Promise<ArtifactRecord> {
  await transitionWorkflow(databaseUrl, key, "submit", actor, comment);
  return getArtifact(databaseUrl, key, actor);
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
  const ai = await completeViaGateway(
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
  );
  let text =
    ai.status === "ok" && ai.text.trim()
      ? ai.text.trim()
      : `${current.currentVersion.content}\n\nAddressed feedback:\n${reason}`;
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
      provenanceSource: ai.status === "ok" ? "AI_INFERRED" : "HUMAN_AUTHORED",
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
    after: { role, aiStatus: ai.status, resubmitted },
    actor,
  });

  return { ...updated, aiStatus: ai.status, aiError: ai.error, resubmitted };
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

  const context = sources
    .map(
      (row) =>
        `### ${row.key} (${row.type}) ${row.currentVersion.title}\n${row.currentVersion.content}`,
    )
    .join("\n\n");

  const ai = await completeViaGateway(
    databaseUrl,
    {
      task: `artifact.${input.kind}`,
      system: buildRoleSystemPrompt(kind.role, kind.task),
      prompt: [
        `Project: ${input.project}`,
        `Produce one ${kind.type} DRAFT that covers these APPROVED source artifacts.`,
        "Output title on the first line, then the body.",
        "",
        context,
      ].join("\n"),
    },
    actor,
  );

  let text =
    ai.status === "ok" && ai.text.trim()
      ? ai.text.trim()
      : `Draft ${kind.type} for ${input.sourceKeys.join(", ")}\n\n${context}`;
  const fenced = text.match(/```(?:markdown|text|gherkin)?\s*([\s\S]*?)```/i);
  if (fenced) {
    text = fenced[1].trim();
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines[0]?.replace(/^#+\s*/, "").slice(0, 120) || `${kind.type} for ${input.sourceKeys[0]}`;
  const content = lines.length > 1 ? lines.join("\n") : text;

  const created = await createArtifact(
    databaseUrl,
    {
      project: input.project,
      type: kind.type,
      title,
      content,
      provenanceSource: ai.status === "ok" ? "AI_INFERRED" : "HUMAN_AUTHORED",
      provenanceAuthority: "SETWIN",
    },
    actor,
  );

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
    action: `artifact.propose_${input.kind}`,
    entityType: "artifact",
    entityId: created.id,
    entityKey: created.key,
    version: 1,
    after: { sources: input.sourceKeys, aiStatus: ai.status, gated: requireApproved },
    actor,
  });

  return [{ ...created, aiStatus: ai.status, aiError: ai.error }];
}
