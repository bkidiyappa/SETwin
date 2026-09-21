import { ValidationError, requirePermission, type Principal } from "@setwin/auth";
import {
  createRelationship,
  getArtifact,
  listArtifacts,
  listRelationships,
  type ArtifactRecord,
  type ArtifactType,
  type RelationshipType,
} from "@setwin/twin";
import { proposeFollowOnArtifacts, type FollowOnKind } from "./lifecycle.ts";

export type StageId = "story" | "design" | "code" | "test";

export type StageDefinition = {
  id: StageId;
  label: string;
  order: number;
  artifactTypes: ArtifactType[];
  /** Previous stage that must have APPROVED artifacts before this stage can be created. */
  requiresApprovedStage: StageId | null;
  createPermissions: string[];
  approvePermission: string;
  createRoles: string[];
  approveRoles: string[];
  followOnKind: FollowOnKind | null;
  relationshipToPrior: RelationshipType;
};

/** Enterprise SDLC stages — approval gates progression. */
export const SDLC_STAGES: StageDefinition[] = [
  {
    id: "story",
    label: "Stories / Requirements",
    order: 1,
    artifactTypes: ["STORY", "REQUIREMENT", "FEATURE", "EPIC"],
    requiresApprovedStage: null,
    createPermissions: ["requirement:create", "artifact:create"],
    approvePermission: "artifact:approve",
    createRoles: ["product_owner", "administrator"],
    approveRoles: ["product_owner", "administrator"],
    followOnKind: null,
    relationshipToPrior: "DERIVED_FROM",
  },
  {
    id: "design",
    label: "Design / Architecture",
    order: 2,
    artifactTypes: ["DESIGN", "ARCHITECTURE"],
    requiresApprovedStage: "story",
    createPermissions: ["design:create", "artifact:create"],
    approvePermission: "artifact:approve",
    createRoles: ["architect", "administrator"],
    approveRoles: ["architect", "engineering_manager", "administrator"],
    followOnKind: "design",
    relationshipToPrior: "DESIGNED_BY",
  },
  {
    id: "code",
    label: "Code",
    order: 3,
    artifactTypes: ["CODE"],
    requiresApprovedStage: "design",
    createPermissions: ["artifact:create"],
    approvePermission: "artifact:approve",
    createRoles: ["developer", "administrator"],
    approveRoles: ["engineering_manager", "security_reviewer", "administrator"],
    followOnKind: "code",
    relationshipToPrior: "IMPLEMENTS",
  },
  {
    id: "test",
    label: "Tests",
    order: 4,
    artifactTypes: ["TEST", "GHERKIN"],
    requiresApprovedStage: "code",
    createPermissions: ["test:create", "artifact:create"],
    approvePermission: "artifact:approve",
    createRoles: ["qa_reviewer", "administrator"],
    approveRoles: ["qa_reviewer", "administrator"],
    followOnKind: "tests",
    relationshipToPrior: "TESTED_BY",
  },
];

export type StageStatus = {
  stage: StageDefinition;
  artifacts: ArtifactRecord[];
  approvedCount: number;
  inReviewCount: number;
  draftCount: number;
  canAdvance: boolean;
  blockedReason: string | null;
};

export type PipelineStatus = {
  project: string;
  stages: StageStatus[];
  relationships: Array<{ from: string; to: string; type: string }>;
};

export function getStageForType(type: string): StageDefinition | undefined {
  const upper = type.toUpperCase();
  return SDLC_STAGES.find((stage) => stage.artifactTypes.includes(upper as ArtifactType));
}

export function actorCanCreateStage(actor: Principal | undefined, stageId: StageId): boolean {
  if (!actor) {
    return false;
  }
  if (actor.roles.includes("administrator")) {
    return true;
  }
  const stage = SDLC_STAGES.find((row) => row.id === stageId);
  if (!stage) {
    return false;
  }
  if (stage.createRoles.some((role) => actor.roles.includes(role))) {
    return true;
  }
  // Stage-specific permissions only — bare artifact:create is not enough to skip role gates.
  const specific = stage.createPermissions.filter((perm) => perm !== "artifact:create");
  return specific.some((perm) => actor.permissions.includes(perm));
}

export function actorCanApprove(actor: Principal | undefined): boolean {
  if (!actor) {
    return false;
  }
  return actor.roles.includes("administrator") || actor.permissions.includes("artifact:approve");
}

export async function getPipelineStatus(
  databaseUrl: string,
  project: string,
  actor?: Principal,
): Promise<PipelineStatus> {
  await requirePermission(databaseUrl, actor, "artifact:view");
  const all = await listArtifacts(databaseUrl, actor, { project });
  const stages: StageStatus[] = [];
  const edgeSet = new Map<string, { from: string; to: string; type: string }>();

  for (const stage of SDLC_STAGES) {
    const artifacts = all.filter((row) => stage.artifactTypes.includes(row.type as ArtifactType));
    const approvedCount = artifacts.filter((row) => row.currentVersion.workflowState === "APPROVED").length;
    const inReviewCount = artifacts.filter((row) => row.currentVersion.workflowState === "IN_REVIEW").length;
    const draftCount = artifacts.filter((row) => row.currentVersion.workflowState === "DRAFT").length;

    let canAdvance = false;
    let blockedReason: string | null = null;
    if (!stage.requiresApprovedStage) {
      canAdvance = false;
      blockedReason = null;
    } else {
      const prior = stages.find((row) => row.stage.id === stage.requiresApprovedStage);
      if (!prior || prior.approvedCount === 0) {
        blockedReason = `Requires at least one APPROVED artifact in ${stage.requiresApprovedStage} stage`;
        canAdvance = false;
      } else {
        canAdvance = true;
        blockedReason = null;
      }
    }

    for (const artifact of artifacts) {
      const rels = await listRelationships(databaseUrl, artifact.key, actor);
      for (const rel of rels) {
        const key = `${rel.fromKey}|${rel.type}|${rel.toKey}`;
        edgeSet.set(key, { from: rel.fromKey, to: rel.toKey, type: rel.type });
      }
    }

    stages.push({
      stage,
      artifacts,
      approvedCount,
      inReviewCount,
      draftCount,
      canAdvance,
      blockedReason,
    });
  }

  return { project, stages, relationships: [...edgeSet.values()] };
}

/**
 * Advance to the next SDLC stage from APPROVED prior-stage artifacts.
 * Reuses existing related artifacts when present (many-to-many); otherwise creates DRAFT(s).
 */
export async function advancePipelineStage(
  databaseUrl: string,
  input: {
    project: string;
    targetStage: StageId;
    sourceKeys?: string[];
    reuseExisting?: boolean;
  },
  actor?: Principal,
): Promise<{
  reused: ArtifactRecord[];
  created: Array<ArtifactRecord & { aiStatus?: string; aiError?: string }>;
  links: Array<{ from: string; to: string; type: string }>;
  blockedReason?: string;
}> {
  await requirePermission(databaseUrl, actor, "artifact:create");
  const target = SDLC_STAGES.find((row) => row.id === input.targetStage);
  if (!target || !target.followOnKind) {
    throw new ValidationError(`Stage ${input.targetStage} cannot be advanced via pipeline`);
  }
  if (!actorCanCreateStage(actor, target.id)) {
    throw new ValidationError(
      `Your roles/permissions cannot create ${target.label} artifacts (need ${target.createRoles.join(" or ")})`,
    );
  }

  const pipeline = await getPipelineStatus(databaseUrl, input.project, actor);
  const targetStatus = pipeline.stages.find((row) => row.stage.id === target.id);
  if (targetStatus && !targetStatus.canAdvance) {
    return {
      reused: [],
      created: [],
      links: [],
      blockedReason: targetStatus.blockedReason ?? "Prior stage not approved",
    };
  }

  const priorStage = SDLC_STAGES.find((row) => row.id === target.requiresApprovedStage);
  if (!priorStage) {
    throw new ValidationError("Target stage has no prior stage");
  }

  const priorStatus = pipeline.stages.find((row) => row.stage.id === priorStage.id);
  const approvedPrior =
    priorStatus?.artifacts.filter((row) => row.currentVersion.workflowState === "APPROVED") ?? [];
  if (!approvedPrior.length) {
    throw new ValidationError(`No APPROVED ${priorStage.label} artifacts — cannot advance to ${target.label}`);
  }

  let sources = approvedPrior;
  if (input.sourceKeys?.length) {
    const wanted = new Set(input.sourceKeys.map((key) => key.toUpperCase()));
    sources = approvedPrior.filter((row) => wanted.has(row.key));
    if (!sources.length) {
      throw new ValidationError("None of the selected sourceKeys are APPROVED in the prior stage");
    }
  }

  const reuseExisting = input.reuseExisting !== false;
  const reused: ArtifactRecord[] = [];
  const links: Array<{ from: string; to: string; type: string }> = [];
  const sourcesNeedingNew: ArtifactRecord[] = [];

  if (reuseExisting) {
    // Find existing target-stage artifacts already linked to any source; link remaining sources (m2m).
    const existingByKey = new Map<string, ArtifactRecord>();
    for (const source of sources) {
      const rels = await listRelationships(databaseUrl, source.key, actor);
      for (const rel of rels) {
        const otherKey = rel.fromKey === source.key ? rel.toKey : rel.fromKey;
        try {
          const other = await getArtifact(databaseUrl, otherKey, actor);
          if (target.artifactTypes.includes(other.type as ArtifactType)) {
            existingByKey.set(other.key, other);
          }
        } catch {
          // ignore missing
        }
      }
    }

    if (existingByKey.size > 0) {
      const existing = [...existingByKey.values()];
      for (const artifact of existing) {
        reused.push(artifact);
        for (const source of sources) {
          const linked = await ensureRelationship(
            databaseUrl,
            {
              from: artifact.key,
              to: source.key,
              type: target.relationshipToPrior,
            },
            actor,
          );
          if (linked) {
            links.push(linked);
          }
        }
      }
    } else {
      sourcesNeedingNew.push(...sources);
    }
  } else {
    sourcesNeedingNew.push(...sources);
  }

  let created: Array<ArtifactRecord & { aiStatus?: string; aiError?: string }> = [];
  if (sourcesNeedingNew.length || (!reuseExisting && sources.length)) {
    const keys = (sourcesNeedingNew.length ? sourcesNeedingNew : sources).map((row) => row.key);
    created = await proposeFollowOnArtifacts(
      databaseUrl,
      {
        project: input.project,
        sourceKeys: keys,
        kind: target.followOnKind,
        requireApproved: true,
      },
      actor,
    );
    for (const row of created) {
      for (const source of sources) {
        links.push({ from: row.key, to: source.key, type: target.relationshipToPrior });
      }
    }
  }

  // Also link created/reused artifacts to approved stories when advancing past design (traceability spine).
  if (target.id === "code" || target.id === "test") {
    const storyStage = pipeline.stages.find((row) => row.stage.id === "story");
    const approvedStories =
      storyStage?.artifacts.filter((row) => row.currentVersion.workflowState === "APPROVED") ?? [];
    const targets = [...reused, ...created];
    const relType = target.id === "code" ? "IMPLEMENTS" : "TESTED_BY";
    for (const artifact of targets) {
      for (const story of approvedStories) {
        const linked = await ensureRelationship(
          databaseUrl,
          { from: artifact.key, to: story.key, type: relType },
          actor,
        );
        if (linked) {
          links.push(linked);
        }
      }
    }
  }

  return { reused, created, links };
}

/** Explicit many-to-many link between any two artifacts (permission: artifact:create). */
export async function linkArtifacts(
  databaseUrl: string,
  input: { from: string; to: string; type: string },
  actor?: Principal,
): Promise<{ from: string; to: string; type: string }> {
  await requirePermission(databaseUrl, actor, "artifact:create");
  const from = await getArtifact(databaseUrl, input.from, actor);
  const to = await getArtifact(databaseUrl, input.to, actor);
  await createRelationship(
    databaseUrl,
    {
      from: from.key,
      to: to.key,
      type: input.type,
      source: "HUMAN",
    },
    actor,
  );
  return { from: from.key, to: to.key, type: input.type.toUpperCase() };
}

async function ensureRelationship(
  databaseUrl: string,
  input: { from: string; to: string; type: string },
  actor?: Principal,
): Promise<{ from: string; to: string; type: string } | null> {
  try {
    await createRelationship(
      databaseUrl,
      {
        from: input.from,
        to: input.to,
        type: input.type,
        source: "AI_INFERRED",
        confidence: 0.75,
      },
      actor,
    );
    return { from: input.from.toUpperCase(), to: input.to.toUpperCase(), type: input.type };
  } catch {
    return null;
  }
}
