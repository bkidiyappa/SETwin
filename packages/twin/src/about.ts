import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NotFoundError, requirePermission, type Principal } from "@setwin/auth";
import {
  approvalDecisions,
  approvalRequests,
  artifactRelationships,
  artifactVersions,
  artifacts,
  reviews,
  users,
  withDatabase,
  workflowTransitions,
} from "@setwin/database";

export type ArtifactAboutEvent = {
  at: string;
  label: string;
  actor: string;
  detail: string;
};

export type ArtifactAbout = {
  key: string;
  type: string;
  title: string;
  createdBy: string;
  createdAt: string;
  provenance: { source: string; authority: string; author: string };
  designs: Array<{ key: string; title: string; createdBy: string; createdAt: string }>;
  timeline: ArtifactAboutEvent[];
};

const ACTION_LABEL: Record<string, string> = {
  submit: "Submitted",
  approve: "Approved",
  reject: "Rejected",
  request_changes: "Changes requested",
  APPROVE: "Approved",
  REJECT: "Rejected",
  CHANGES_REQUESTED: "Changes requested",
};

export async function getArtifactAbout(
  databaseUrl: string,
  key: string,
  actor?: Principal,
): Promise<ArtifactAbout> {
  await requirePermission(databaseUrl, actor, "artifact:view");
  const artifactKey = key.trim().toUpperCase();
  return withDatabase(databaseUrl, async ({ db }) => {
    const artifact = (await db.select().from(artifacts).where(eq(artifacts.key, artifactKey)))[0];
    if (!artifact || artifact.deletedAt) {
      throw new NotFoundError(`Artifact not found: ${key}`);
    }
    const versionRows = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifact.id))
      .orderBy(asc(artifactVersions.version));
    const current = versionRows.find((row) => row.id === artifact.currentVersionId) ?? versionRows.at(-1);
    if (!current) {
      throw new NotFoundError(`Artifact not found: ${key}`);
    }
    const userIds = new Set<string>([artifact.createdBy, current.createdBy]);
    const fromArtifact = alias(artifacts, "about_from");
    const toArtifact = alias(artifacts, "about_to");
    const links = await db
      .select({
        type: artifactRelationships.type,
        fromKey: fromArtifact.key,
        fromType: fromArtifact.type,
        fromCreatedBy: fromArtifact.createdBy,
        fromCreatedAt: fromArtifact.createdAt,
        toKey: toArtifact.key,
        toType: toArtifact.type,
        toCreatedBy: toArtifact.createdBy,
        toCreatedAt: toArtifact.createdAt,
      })
      .from(artifactRelationships)
      .innerJoin(fromArtifact, eq(fromArtifact.id, artifactRelationships.fromArtifactId))
      .innerJoin(toArtifact, eq(toArtifact.id, artifactRelationships.toArtifactId))
      .where(
        and(
          or(eq(fromArtifact.id, artifact.id), eq(toArtifact.id, artifact.id)),
          isNull(fromArtifact.deletedAt),
          isNull(toArtifact.deletedAt),
        ),
      );
    const designKeys = new Map<string, { key: string; type: string; createdBy: string; createdAt: Date }>();
    for (const link of links) {
      const other =
        link.fromKey === artifact.key
          ? { key: link.toKey, type: link.toType, createdBy: link.toCreatedBy, createdAt: link.toCreatedAt }
          : { key: link.fromKey, type: link.fromType, createdBy: link.fromCreatedBy, createdAt: link.fromCreatedAt };
      if (other.type === "DESIGN" || other.type === "ARCHITECTURE") {
        designKeys.set(other.key, other);
        userIds.add(other.createdBy);
      }
    }
    const designVersions = designKeys.size
      ? await db
          .select({
            key: artifacts.key,
            title: artifactVersions.title,
            createdBy: artifacts.createdBy,
            createdAt: artifacts.createdAt,
          })
          .from(artifacts)
          .innerJoin(artifactVersions, eq(artifactVersions.id, artifacts.currentVersionId))
          .where(inArray(artifacts.key, [...designKeys.keys()]))
      : [];
    const versionIds = versionRows.map((row) => row.id);
    const transitions = versionIds.length
      ? await db
          .select()
          .from(workflowTransitions)
          .where(inArray(workflowTransitions.artifactVersionId, versionIds))
          .orderBy(asc(workflowTransitions.createdAt))
      : [];
    for (const row of transitions) {
      userIds.add(row.actorId);
    }
    const reviewRows = versionIds.length
      ? await db.select().from(reviews).where(inArray(reviews.artifactVersionId, versionIds))
      : [];
    const reviewIds = reviewRows.map((row) => row.id);
    const requestRows = reviewIds.length
      ? await db.select().from(approvalRequests).where(inArray(approvalRequests.reviewId, reviewIds))
      : [];
    const requestIds = requestRows.map((row) => row.id);
    const decisions = requestIds.length
      ? await db
          .select()
          .from(approvalDecisions)
          .where(inArray(approvalDecisions.requestId, requestIds))
          .orderBy(asc(approvalDecisions.createdAt))
      : [];
    for (const row of decisions) {
      userIds.add(row.actorId);
    }
    const people = userIds.size
      ? await db
          .select({ id: users.id, username: users.username, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, [...userIds]))
      : [];
    const nameOf = (id: string) => {
      const person = people.find((row) => row.id === id);
      return person?.displayName || person?.username || "Unknown";
    };
    const timeline: ArtifactAboutEvent[] = [
      {
        at: artifact.createdAt.toISOString(),
        label: "Created",
        actor: nameOf(artifact.createdBy),
        detail: artifact.type,
      },
    ];
    for (const design of designVersions) {
      timeline.push({
        at: design.createdAt.toISOString(),
        label: "Designed",
        actor: nameOf(design.createdBy),
        detail: `${design.key} · ${design.title}`,
      });
    }
    for (const row of transitions) {
      timeline.push({
        at: row.createdAt.toISOString(),
        label: ACTION_LABEL[row.action] ?? row.action,
        actor: nameOf(row.actorId),
        detail: row.comment || `${row.fromState} → ${row.toState}`,
      });
    }
    for (const row of decisions) {
      timeline.push({
        at: row.createdAt.toISOString(),
        label: ACTION_LABEL[row.decision] ?? row.decision,
        actor: nameOf(row.actorId),
        detail: row.comment || row.decision,
      });
    }
    timeline.sort((a, b) => a.at.localeCompare(b.at));
    return {
      key: artifact.key,
      type: artifact.type,
      title: current.title,
      createdBy: nameOf(artifact.createdBy),
      createdAt: artifact.createdAt.toISOString(),
      provenance: {
        source: current.provenanceSource,
        authority: current.provenanceAuthority,
        author: nameOf(current.createdBy),
      },
      designs: designVersions.map((row) => ({
        key: row.key,
        title: row.title,
        createdBy: nameOf(row.createdBy),
        createdAt: row.createdAt.toISOString(),
      })),
      timeline,
    };
  });
}
