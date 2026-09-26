import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { recordAuditEvent } from "@setwin/audit";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  requirePermission,
  type Principal,
} from "@setwin/auth";
import {
  approvalDecisions,
  approvalRequests,
  artifactRelationships,
  artifactVersions,
  artifacts,
  gherkinFeatures,
  gherkinScenarios,
  gherkinSteps,
  projects,
  reviewFindings,
  reviews,
  withDatabase,
  workflowTransitions,
} from "@setwin/database";
import {
  ARTIFACT_PREFIX,
  ARTIFACT_TYPES,
  PROVENANCE_AUTHORITIES,
  PROVENANCE_SOURCES,
  RELATIONSHIP_SOURCES,
  RELATIONSHIP_TYPES,
  type ArtifactRecord,
  type ArtifactType,
  type ArtifactVersionRecord,
  type GherkinRecord,
  type ParsedGherkinFeature,
  type ProjectRecord,
  type ProvenanceAuthority,
  type ProvenanceSource,
  type RelationshipRecord,
  type RelationshipSource,
  type RelationshipType,
  type VersionStatus,
  type WorkflowState,
} from "./types.ts";
import { parseGherkin } from "./parse.ts";

function parseArtifactType(value: string): ArtifactType {
  const type = value.trim().toUpperCase();
  if (!ARTIFACT_TYPES.includes(type as ArtifactType)) {
    throw new ValidationError(`Unknown artifact type: ${value}`);
  }
  return type as ArtifactType;
}

function parseRelationshipType(value: string): RelationshipType {
  const type = value.trim().toUpperCase();
  if (!RELATIONSHIP_TYPES.includes(type as RelationshipType)) {
    throw new ValidationError(`Unknown relationship type: ${value}`);
  }
  return type as RelationshipType;
}

function parseProvenanceSource(value: string | undefined): ProvenanceSource {
  const source = (value ?? "HUMAN_AUTHORED").trim().toUpperCase();
  if (!PROVENANCE_SOURCES.includes(source as ProvenanceSource)) {
    throw new ValidationError(`Unknown provenance source: ${value}`);
  }
  return source as ProvenanceSource;
}

function parseProvenanceAuthority(value: string | undefined): ProvenanceAuthority {
  const authority = (value ?? "SETWIN").trim().toUpperCase();
  if (!PROVENANCE_AUTHORITIES.includes(authority as ProvenanceAuthority)) {
    throw new ValidationError(`Unknown provenance authority: ${value}`);
  }
  return authority as ProvenanceAuthority;
}

function parseRelationshipSource(value: string | undefined): RelationshipSource {
  const source = (value ?? "HUMAN").trim().toUpperCase();
  if (!RELATIONSHIP_SOURCES.includes(source as RelationshipSource)) {
    throw new ValidationError(`Unknown relationship source: ${value}`);
  }
  return source as RelationshipSource;
}

function projectKey(value: string): string {
  const key = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(key)) {
    throw new ValidationError("Project key must be a lowercase slug, 2-63 characters.");
  }
  return key;
}

export async function createProject(
  databaseUrl: string,
  input: { key: string; name?: string; description?: string; techStack?: string },
  actor?: Principal,
): Promise<ProjectRecord> {
  const principal = await requirePermission(databaseUrl, actor, "project:create");
  const key = projectKey(input.key);
  const name = input.name?.trim() || key;
  const techStack = input.techStack?.trim() ?? "";
  const row = await withDatabase(databaseUrl, async ({ db }) => {
    const existing = (await db.select().from(projects).where(eq(projects.key, key)))[0];
    if (existing) {
      throw new ConflictError(`Project already exists: ${key}`);
    }
    const created = {
      id: randomUUID(),
      key,
      name,
      description: input.description?.trim() ?? "",
      techStack,
      createdBy: principal.id,
      createdAt: new Date(),
    };
    await db.insert(projects).values(created);
    return created;
  });
  await recordAuditEvent(databaseUrl, {
    action: "twin.project.create",
    entityType: "project",
    entityId: row.id,
    entityKey: row.key,
    after: { key: row.key, name: row.name, techStack: row.techStack },
    actor: principal,
  });
  return row;
}

export async function updateProject(
  databaseUrl: string,
  key: string,
  input: { name?: string; description?: string; techStack?: string },
  actor?: Principal,
): Promise<ProjectRecord> {
  const principal = await requirePermission(databaseUrl, actor, "project:create");
  const updated = await withDatabase(databaseUrl, async ({ db }) => {
    const row = (await db.select().from(projects).where(eq(projects.key, projectKey(key))))[0];
    if (!row) {
      throw new NotFoundError(`Project not found: ${key}`);
    }
    const patch: Partial<typeof projects.$inferInsert> = {};
    if (input.name !== undefined) {
      patch.name = input.name.trim() || row.name;
    }
    if (input.description !== undefined) {
      patch.description = input.description.trim();
    }
    if (input.techStack !== undefined) {
      patch.techStack = input.techStack.trim();
    }
    if (Object.keys(patch).length) {
      await db.update(projects).set(patch).where(eq(projects.id, row.id));
    }
    const next = (await db.select().from(projects).where(eq(projects.id, row.id)))[0]!;
    return toProject(next);
  });
  await recordAuditEvent(databaseUrl, {
    action: "twin.project.update",
    entityType: "project",
    entityId: updated.id,
    entityKey: updated.key,
    after: { name: updated.name, techStack: updated.techStack },
    actor: principal,
  });
  return updated;
}

export async function listProjects(databaseUrl: string, actor?: Principal): Promise<ProjectRecord[]> {
  await requirePermission(databaseUrl, actor, "project:view");
  return withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db.select().from(projects).orderBy(asc(projects.key));
    return rows.map(toProject);
  });
}

export async function getProject(databaseUrl: string, key: string, actor?: Principal): Promise<ProjectRecord> {
  await requirePermission(databaseUrl, actor, "project:view");
  return withDatabase(databaseUrl, async ({ db }) => {
    const row = (await db.select().from(projects).where(eq(projects.key, projectKey(key))))[0];
    if (!row) {
      throw new NotFoundError(`Project not found: ${key}`);
    }
    return toProject(row);
  });
}

export async function createArtifact(
  databaseUrl: string,
  input: {
    project: string;
    type: string;
    title: string;
    content?: string;
    provenanceSource?: string;
    provenanceAuthority?: string;
  },
  actor?: Principal,
): Promise<ArtifactRecord> {
  const principal = await requirePermission(databaseUrl, actor, "artifact:create");
  const type = parseArtifactType(input.type);
  const title = input.title.trim();
  if (!title) {
    throw new ValidationError("Title is required");
  }
  const provenanceSource = parseProvenanceSource(input.provenanceSource);
  const provenanceAuthority = parseProvenanceAuthority(input.provenanceAuthority);
  const content = input.content ?? "";
  const parsed = type === "GHERKIN" ? parseGherkin(content) : undefined;
  const created = await withDatabase(databaseUrl, async (client) => {
    const project = (await client.db.select().from(projects).where(eq(projects.key, projectKey(input.project))))[0];
    if (!project) {
      throw new NotFoundError(`Project not found: ${input.project}`);
    }
    const key = await nextArtifactKey(client, type);
    const now = new Date();
    const artifactId = randomUUID();
    const versionId = randomUUID();
    await client.db.insert(artifacts).values({
      id: artifactId,
      projectId: project.id,
      key,
      type,
      createdBy: principal.id,
      createdAt: now,
      currentVersionId: versionId,
    });
    await client.db.insert(artifactVersions).values({
      id: versionId,
      artifactId,
      version: 1,
      status: "DRAFT",
      workflowState: "DRAFT",
      title,
      content,
      provenanceSource,
      provenanceAuthority,
      createdBy: principal.id,
      createdAt: now,
      supersededBy: null,
    });
    if (parsed) {
      await persistGherkin(client, versionId, parsed);
    }
    return loadArtifact(client, key);
  });
  await recordAuditEvent(databaseUrl, {
    action: "twin.artifact.create",
    entityType: "artifact",
    entityId: created.id,
    entityKey: created.key,
    version: created.currentVersion.version,
    after: {
      type: created.type,
      title: created.currentVersion.title,
      status: created.currentVersion.status,
    },
    actor: principal,
  });
  return created;
}

export async function listArtifacts(
  databaseUrl: string,
  actor?: Principal,
  filter?: { project?: string; type?: string; includeDeleted?: boolean },
): Promise<ArtifactRecord[]> {
  await requirePermission(databaseUrl, actor, "artifact:view");
  const type = filter?.type ? parseArtifactType(filter.type) : undefined;
  return withDatabase(databaseUrl, async (client) => {
    let projectId: string | undefined;
    if (filter?.project) {
      const project = (await client.db.select().from(projects).where(eq(projects.key, projectKey(filter.project))))[0];
      if (!project) {
        throw new NotFoundError(`Project not found: ${filter.project}`);
      }
      projectId = project.id;
    }
    const rows = projectId
      ? await client.db.select().from(artifacts).where(eq(artifacts.projectId, projectId)).orderBy(asc(artifacts.key))
      : await client.db.select().from(artifacts).orderBy(asc(artifacts.key));
    const filtered = rows.filter((row) => {
      if (!filter?.includeDeleted && row.deletedAt) {
        return false;
      }
      if (type && row.type !== type) {
        return false;
      }
      return true;
    });
    const result: ArtifactRecord[] = [];
    for (const row of filtered) {
      result.push(await loadArtifact(client, row.key, { allowDeleted: Boolean(filter?.includeDeleted) }));
    }
    return result;
  });
}

export async function getArtifact(databaseUrl: string, key: string, actor?: Principal): Promise<ArtifactRecord> {
  await requirePermission(databaseUrl, actor, "artifact:view");
  return withDatabase(databaseUrl, async (client) => loadArtifact(client, key.trim().toUpperCase()));
}

function requireAdmin(actor?: Principal): Principal {
  if (!actor?.roles.includes("administrator")) {
    throw new AuthorizationError("Administrator role required");
  }
  return actor;
}

/** Soft-delete an artifact. Admins always; DRAFT tests may be removed by test authors. */
export async function softDeleteArtifact(
  databaseUrl: string,
  key: string,
  actor?: Principal,
): Promise<ArtifactRecord> {
  const principal = actor;
  if (!principal) {
    throw new AuthorizationError("Authentication required");
  }
  await requirePermission(databaseUrl, principal, "artifact:view");
  const updated = await withDatabase(databaseUrl, async (client) => {
    const artifact = (await client.db.select().from(artifacts).where(eq(artifacts.key, key.trim().toUpperCase())))[0];
    if (!artifact || artifact.deletedAt) {
      throw new NotFoundError(`Artifact not found: ${key}`);
    }
    const loaded = await loadArtifact(client, artifact.key, { allowDeleted: true });
    const isDraftTest =
      (loaded.type === "GHERKIN" || loaded.type === "TEST") &&
      loaded.currentVersion.workflowState === "DRAFT";
    const isAdmin = principal.roles.includes("administrator");
    if (!isAdmin && !isDraftTest) {
      throw new AuthorizationError("Administrator role required");
    }
    if (!isAdmin && isDraftTest) {
      await requirePermission(databaseUrl, principal, "artifact:create");
    }
    const now = new Date();
    await client.db.update(artifacts).set({ deletedAt: now }).where(eq(artifacts.id, artifact.id));
    return loadArtifact(client, artifact.key, { allowDeleted: true });
  });
  await recordAuditEvent(databaseUrl, {
    action: "twin.artifact.soft_delete",
    entityType: "artifact",
    entityId: updated.id,
    entityKey: updated.key,
    version: updated.currentVersion.version,
    after: { deletedAt: updated.deletedAt?.toISOString() ?? new Date().toISOString() },
    actor: principal,
  });
  return updated;
}

/**
 * Permanently delete a TEST/GHERKIN artifact (workspace Tests column).
 * Allowed for DRAFT tests (with create permission) or administrators.
 */
export async function permanentlyDeleteTestArtifact(
  databaseUrl: string,
  key: string,
  actor?: Principal,
): Promise<{ key: string; deleted: true }> {
  const principal = actor;
  if (!principal) {
    throw new AuthorizationError("Authentication required");
  }
  await requirePermission(databaseUrl, principal, "artifact:view");

  const snapshot = await withDatabase(databaseUrl, async (client) => {
    const artifact = (await client.db.select().from(artifacts).where(eq(artifacts.key, key.trim().toUpperCase())))[0];
    if (!artifact) {
      throw new NotFoundError(`Artifact not found: ${key}`);
    }
    const loaded = await loadArtifact(client, artifact.key, { allowDeleted: true });
    if (loaded.type !== "GHERKIN" && loaded.type !== "TEST") {
      throw new ValidationError(`Only TEST/GHERKIN artifacts can be permanently deleted (got ${loaded.type})`);
    }
    const isAdmin = principal.roles.includes("administrator");
    const isDraft = loaded.currentVersion.workflowState === "DRAFT";
    if (!isAdmin && !isDraft) {
      throw new AuthorizationError("Only DRAFT tests can be permanently deleted (or admin)");
    }
    if (!isAdmin) {
      await requirePermission(databaseUrl, principal, "artifact:create");
    }

    const versionRows = await client.db
      .select({ id: artifactVersions.id })
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifact.id));
    const versionIds = versionRows.map((row) => row.id);

    for (const versionId of versionIds) {
      const featureRows = await client.db
        .select({ id: gherkinFeatures.id })
        .from(gherkinFeatures)
        .where(eq(gherkinFeatures.artifactVersionId, versionId));
      for (const feature of featureRows) {
        const scenarioRows = await client.db
          .select({ id: gherkinScenarios.id })
          .from(gherkinScenarios)
          .where(eq(gherkinScenarios.featureId, feature.id));
        for (const scenario of scenarioRows) {
          await client.db.delete(gherkinSteps).where(eq(gherkinSteps.scenarioId, scenario.id));
        }
        for (const scenario of scenarioRows) {
          await client.db.delete(gherkinScenarios).where(eq(gherkinScenarios.id, scenario.id));
        }
        await client.db.delete(gherkinFeatures).where(eq(gherkinFeatures.id, feature.id));
      }

      const reviewRows = await client.db.select({ id: reviews.id }).from(reviews).where(eq(reviews.artifactVersionId, versionId));
      for (const review of reviewRows) {
        const requestRows = await client.db
          .select({ id: approvalRequests.id })
          .from(approvalRequests)
          .where(eq(approvalRequests.reviewId, review.id));
        for (const request of requestRows) {
          await client.db.delete(approvalDecisions).where(eq(approvalDecisions.requestId, request.id));
        }
        for (const request of requestRows) {
          await client.db.delete(approvalRequests).where(eq(approvalRequests.id, request.id));
        }
        await client.db.delete(reviewFindings).where(eq(reviewFindings.reviewId, review.id));
        await client.db.delete(reviews).where(eq(reviews.id, review.id));
      }

      await client.db.delete(workflowTransitions).where(eq(workflowTransitions.artifactVersionId, versionId));
    }

    await client.db
      .delete(artifactRelationships)
      .where(or(eq(artifactRelationships.fromArtifactId, artifact.id), eq(artifactRelationships.toArtifactId, artifact.id)));

    await client.db.update(artifacts).set({ currentVersionId: null }).where(eq(artifacts.id, artifact.id));
    await client.db.delete(artifactVersions).where(eq(artifactVersions.artifactId, artifact.id));
    await client.db.delete(artifacts).where(eq(artifacts.id, artifact.id));

    return { key: loaded.key, id: loaded.id, version: loaded.currentVersion.version };
  });

  await recordAuditEvent(databaseUrl, {
    action: "twin.artifact.hard_delete",
    entityType: "artifact",
    entityId: snapshot.id,
    entityKey: snapshot.key,
    version: snapshot.version,
    after: { deleted: true, permanent: true },
    actor: principal,
  });

  return { key: snapshot.key, deleted: true };
}

export async function createGherkin(
  databaseUrl: string,
  input: {
    project: string;
    content: string;
    title?: string;
    requirement?: string;
    provenanceSource?: string;
    provenanceAuthority?: string;
  },
  actor?: Principal,
): Promise<GherkinRecord> {
  const parsed = parseGherkin(input.content);
  const artifact = await createArtifact(
    databaseUrl,
    {
      project: input.project,
      type: "GHERKIN",
      title: input.title?.trim() || parsed.name,
      content: input.content,
      provenanceSource: input.provenanceSource,
      provenanceAuthority: input.provenanceAuthority,
    },
    actor,
  );
  if (input.requirement) {
    const requirement = await getArtifact(databaseUrl, input.requirement, actor);
    if (
      requirement.type !== "REQUIREMENT" &&
      requirement.type !== "STORY" &&
      requirement.type !== "FEATURE" &&
      requirement.type !== "EPIC"
    ) {
      throw new ValidationError(
        `Traceability target must be a REQUIREMENT/STORY/FEATURE/EPIC, got ${requirement.type}`,
      );
    }
    await createRelationship(
      databaseUrl,
      { from: artifact.key, to: requirement.key, type: "VALIDATES", source: "HUMAN" },
      actor,
    );
  }
  return getGherkin(databaseUrl, artifact.key, actor);
}

export async function getGherkin(databaseUrl: string, key: string, actor?: Principal): Promise<GherkinRecord> {
  const artifact = await getArtifact(databaseUrl, key, actor);
  if (artifact.type !== "GHERKIN") {
    throw new ValidationError(`Artifact ${artifact.key} is not Gherkin`);
  }
  const links = await listRelationships(databaseUrl, artifact.key, actor);
  const feature = await withDatabase(databaseUrl, async (client) => loadParsedGherkin(client, artifact.currentVersion.id));
  return {
    artifact,
    feature,
    validates: links.filter((row) => row.type === "VALIDATES" && row.fromKey === artifact.key).map((row) => row.toKey),
  };
}

export async function listGherkin(
  databaseUrl: string,
  actor?: Principal,
  filter?: { project?: string },
): Promise<GherkinRecord[]> {
  const rows = await listArtifacts(databaseUrl, actor, { project: filter?.project, type: "GHERKIN" });
  const result: GherkinRecord[] = [];
  for (const row of rows) {
    result.push(await getGherkin(databaseUrl, row.key, actor));
  }
  return result;
}

export async function createArtifactVersion(
  databaseUrl: string,
  key: string,
  input: {
    title?: string;
    content?: string;
    provenanceSource?: string;
    provenanceAuthority?: string;
  },
  actor?: Principal,
): Promise<ArtifactRecord> {
  const principal = await requirePermission(databaseUrl, actor, "artifact:create");
  const artifactKey = key.trim().toUpperCase();
  const provenanceSource = parseProvenanceSource(input.provenanceSource);
  const provenanceAuthority = parseProvenanceAuthority(input.provenanceAuthority);
  const before = await getArtifact(databaseUrl, artifactKey, principal);
  const created = await withDatabase(databaseUrl, async (client) => {
    const artifact = (await client.db.select().from(artifacts).where(eq(artifacts.key, artifactKey)))[0];
    if (!artifact) {
      throw new NotFoundError(`Artifact not found: ${key}`);
    }
    const versions = await client.db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifact.id))
      .orderBy(desc(artifactVersions.version));
    const current = versions[0];
    if (!current) {
      throw new NotFoundError(`Artifact not found: ${key}`);
    }
    if (current.status === "APPROVED") {
      // Keep the approved row immutable; the new version is DRAFT.
    } else if (current.status !== "DRAFT") {
      throw new ConflictError(`Cannot version artifact ${artifactKey} from status ${current.status}`);
    }
    if (current.workflowState === "IN_REVIEW") {
      throw new ConflictError("Cannot create a new version while IN_REVIEW. Approve, reject, or request changes first.");
    }

    const versionId = randomUUID();
    const now = new Date();
    const nextVersion = current.version + 1;
    const content = input.content ?? current.content;
    const parsed = artifact.type === "GHERKIN" ? parseGherkin(content) : undefined;
    await client.db.insert(artifactVersions).values({
      id: versionId,
      artifactId: artifact.id,
      version: nextVersion,
      status: "DRAFT",
      workflowState: "DRAFT",
      title: input.title?.trim() || current.title,
      content,
      provenanceSource,
      provenanceAuthority,
      createdBy: principal.id,
      createdAt: now,
      supersededBy: null,
    });
    if (current.status === "DRAFT") {
      await client.db
        .update(artifactVersions)
        .set({ status: "SUPERSEDED", supersededBy: versionId })
        .where(eq(artifactVersions.id, current.id));
    }
    await client.db.update(artifacts).set({ currentVersionId: versionId }).where(eq(artifacts.id, artifact.id));
    if (parsed) {
      await persistGherkin(client, versionId, parsed);
    }
    return loadArtifact(client, artifactKey);
  });
  await recordAuditEvent(databaseUrl, {
    action: "twin.artifact.version",
    entityType: "artifact",
    entityId: created.id,
    entityKey: created.key,
    version: created.currentVersion.version,
    before: {
      version: before.currentVersion.version,
      title: before.currentVersion.title,
      content: before.currentVersion.content,
    },
    after: {
      version: created.currentVersion.version,
      title: created.currentVersion.title,
      content: created.currentVersion.content,
    },
    actor: principal,
  });
  return created;
}

export async function createRelationship(
  databaseUrl: string,
  input: { from: string; to: string; type: string; source?: string; confidence?: number },
  actor?: Principal,
): Promise<RelationshipRecord> {
  const principal = await requirePermission(databaseUrl, actor, "artifact:create");
  const type = parseRelationshipType(input.type);
  const source = parseRelationshipSource(input.source);
  if (source === "AI_INFERRED" && (input.confidence === undefined || Number.isNaN(input.confidence))) {
    throw new ValidationError("AI_INFERRED relationships require a confidence value.");
  }
  if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) {
    throw new ValidationError("Confidence must be between 0 and 1.");
  }
  const fromKey = input.from.trim().toUpperCase();
  const toKey = input.to.trim().toUpperCase();
  if (fromKey === toKey) {
    throw new ValidationError("An artifact cannot relate to itself.");
  }
  return withDatabase(databaseUrl, async (client) => {
    const from = (await client.db.select().from(artifacts).where(eq(artifacts.key, fromKey)))[0];
    const to = (await client.db.select().from(artifacts).where(eq(artifacts.key, toKey)))[0];
    if (!from) {
      throw new NotFoundError(`Artifact not found: ${input.from}`);
    }
    if (!to) {
      throw new NotFoundError(`Artifact not found: ${input.to}`);
    }
    const existing = (
      await client.db
        .select()
        .from(artifactRelationships)
        .where(
          and(
            eq(artifactRelationships.fromArtifactId, from.id),
            eq(artifactRelationships.toArtifactId, to.id),
            eq(artifactRelationships.type, type),
          ),
        )
    )[0];
    if (existing) {
      throw new ConflictError(`Relationship already exists: ${fromKey} ${type} ${toKey}`);
    }
    const now = new Date();
    const row = {
      id: randomUUID(),
      fromArtifactId: from.id,
      toArtifactId: to.id,
      type,
      source,
      confidence: input.confidence ?? null,
      createdBy: principal.id,
      createdAt: now,
      validFrom: now,
      validTo: null,
    };
    await client.db.insert(artifactRelationships).values(row);
    return {
      id: row.id,
      type,
      source,
      confidence: row.confidence,
      fromKey,
      toKey,
      createdBy: principal.id,
      createdAt: now,
    };
  });
}

export async function listRelationships(
  databaseUrl: string,
  key: string,
  actor?: Principal,
): Promise<RelationshipRecord[]> {
  await requirePermission(databaseUrl, actor, "artifact:view");
  return withDatabase(databaseUrl, async (client) => {
    const artifact = (await client.db.select().from(artifacts).where(eq(artifacts.key, key.trim().toUpperCase())))[0];
    if (!artifact) {
      throw new NotFoundError(`Artifact not found: ${key}`);
    }
    const rows = await client.db
      .select({
        id: artifactRelationships.id,
        type: artifactRelationships.type,
        source: artifactRelationships.source,
        confidence: artifactRelationships.confidence,
        createdBy: artifactRelationships.createdBy,
        createdAt: artifactRelationships.createdAt,
        fromId: artifactRelationships.fromArtifactId,
        toId: artifactRelationships.toArtifactId,
      })
      .from(artifactRelationships)
      .where(
        or(eq(artifactRelationships.fromArtifactId, artifact.id), eq(artifactRelationships.toArtifactId, artifact.id)),
      );
    const result: RelationshipRecord[] = [];
    for (const row of rows) {
      const from = (await client.db.select().from(artifacts).where(eq(artifacts.id, row.fromId)))[0];
      const to = (await client.db.select().from(artifacts).where(eq(artifacts.id, row.toId)))[0];
      if (!from || !to) {
        continue;
      }
      result.push({
        id: row.id,
        type: row.type as RelationshipType,
        source: row.source as RelationshipSource,
        confidence: row.confidence,
        fromKey: from.key,
        toKey: to.key,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
      });
    }
    return result;
  });
}

type DbClient = Parameters<Parameters<typeof withDatabase>[1]>[0];

async function nextArtifactKey(client: DbClient, type: ArtifactType): Promise<string> {
  const prefix = ARTIFACT_PREFIX[type];
  // Keep the counter ahead of keys already stored (including renamed GHK → TST rows).
  const rows = await client.sql<{ last_value: number }[]>`
    INSERT INTO artifact_key_counters (prefix, last_value)
    SELECT ${prefix}, COALESCE(MAX(CAST(substring(key FROM '[0-9]+$') AS integer)), 0) + 1
    FROM artifacts
    WHERE key ~ ('^' || ${prefix} || '-[0-9]+$')
    ON CONFLICT (prefix) DO UPDATE
    SET last_value = GREATEST(
      artifact_key_counters.last_value + 1,
      (
        SELECT COALESCE(MAX(CAST(substring(a.key FROM '[0-9]+$') AS integer)), 0) + 1
        FROM artifacts a
        WHERE a.key ~ ('^' || ${prefix} || '-[0-9]+$')
      )
    )
    RETURNING last_value
  `;
  const value = rows[0]?.last_value;
  if (value === undefined) {
    throw new ConflictError("Failed to allocate artifact key");
  }
  return `${prefix}-${String(value).padStart(3, "0")}`;
}

async function loadArtifact(
  client: DbClient,
  key: string,
  options?: { allowDeleted?: boolean },
): Promise<ArtifactRecord> {
  const artifact = (await client.db.select().from(artifacts).where(eq(artifacts.key, key)))[0];
  if (!artifact) {
    throw new NotFoundError(`Artifact not found: ${key}`);
  }
  if (artifact.deletedAt && !options?.allowDeleted) {
    throw new NotFoundError(`Artifact not found: ${key}`);
  }
  const project = (await client.db.select().from(projects).where(eq(projects.id, artifact.projectId)))[0];
  if (!project) {
    throw new NotFoundError(`Project not found for artifact: ${key}`);
  }
  const versionRows = await client.db
    .select()
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, artifact.id))
    .orderBy(asc(artifactVersions.version));
  const versions = versionRows.map((row) => toVersion(row, artifact.key, versionRows));
  const current = versions.find((row) => row.id === artifact.currentVersionId) ?? versions.at(-1);
  if (!current) {
    throw new NotFoundError(`Artifact not found: ${key}`);
  }
  return {
    id: artifact.id,
    key: artifact.key,
    type: artifact.type as ArtifactType,
    projectKey: project.key,
    createdBy: artifact.createdBy,
    createdAt: artifact.createdAt,
    deletedAt: artifact.deletedAt ?? null,
    currentVersion: current,
    versions,
  };
}

function toVersion(
  row: typeof artifactVersions.$inferSelect,
  artifactKey: string,
  all: Array<typeof artifactVersions.$inferSelect>,
): ArtifactVersionRecord {
  const successor = row.supersededBy ? all.find((item) => item.id === row.supersededBy) : undefined;
  return {
    id: row.id,
    artifactKey,
    version: row.version,
    status: row.status as VersionStatus,
    workflowState: (row.workflowState as WorkflowState | undefined) ?? "DRAFT",
    title: row.title,
    content: row.content,
    provenance: {
      source: row.provenanceSource as ProvenanceSource,
      authority: row.provenanceAuthority as ProvenanceAuthority,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    },
    supersededByVersion: successor?.version ?? null,
  };
}

function toProject(row: typeof projects.$inferSelect): ProjectRecord {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    techStack: row.techStack ?? "",
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

async function persistGherkin(client: DbClient, versionId: string, parsed: ParsedGherkinFeature): Promise<void> {
  const featureId = randomUUID();
  await client.db.insert(gherkinFeatures).values({
    id: featureId,
    artifactVersionId: versionId,
    name: parsed.name,
    description: parsed.description,
    language: parsed.language,
  });
  for (const scenario of parsed.scenarios) {
    const scenarioId = randomUUID();
    await client.db.insert(gherkinScenarios).values({
      id: scenarioId,
      featureId,
      keyword: scenario.keyword,
      name: scenario.name,
      sortOrder: scenario.index,
    });
    for (const step of scenario.steps) {
      await client.db.insert(gherkinSteps).values({
        id: randomUUID(),
        scenarioId,
        keyword: step.keyword,
        text: step.text,
        sortOrder: step.index,
      });
    }
  }
}

async function loadParsedGherkin(client: DbClient, versionId: string): Promise<ParsedGherkinFeature> {
  const feature = (await client.db.select().from(gherkinFeatures).where(eq(gherkinFeatures.artifactVersionId, versionId)))[0];
  if (!feature) {
    throw new NotFoundError("Parsed Gherkin not found for this version");
  }
  const scenarios = await client.db
    .select()
    .from(gherkinScenarios)
    .where(eq(gherkinScenarios.featureId, feature.id))
    .orderBy(asc(gherkinScenarios.sortOrder));
  const parsedScenarios = [];
  for (const scenario of scenarios) {
    const steps = await client.db
      .select()
      .from(gherkinSteps)
      .where(eq(gherkinSteps.scenarioId, scenario.id))
      .orderBy(asc(gherkinSteps.sortOrder));
    parsedScenarios.push({
      keyword: scenario.keyword,
      name: scenario.name,
      index: scenario.sortOrder,
      steps: steps.map((step) => ({ keyword: step.keyword, text: step.text, index: step.sortOrder })),
    });
  }
  return {
    name: feature.name,
    description: feature.description,
    language: feature.language,
    scenarios: parsedScenarios,
  };
}
