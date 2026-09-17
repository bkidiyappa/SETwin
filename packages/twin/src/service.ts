import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, or } from "drizzle-orm";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  requirePermission,
  type Principal,
} from "@setwin/auth";
import {
  artifactRelationships,
  artifactVersions,
  artifacts,
  gherkinFeatures,
  gherkinScenarios,
  gherkinSteps,
  projects,
  withDatabase,
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
  input: { key: string; name?: string; description?: string },
  actor?: Principal,
): Promise<ProjectRecord> {
  const principal = await requirePermission(databaseUrl, actor, "project:create");
  const key = projectKey(input.key);
  const name = input.name?.trim() || key;
  return withDatabase(databaseUrl, async ({ db }) => {
    const existing = (await db.select().from(projects).where(eq(projects.key, key)))[0];
    if (existing) {
      throw new ConflictError(`Project already exists: ${key}`);
    }
    const row = {
      id: randomUUID(),
      key,
      name,
      description: input.description?.trim() ?? "",
      createdBy: principal.id,
      createdAt: new Date(),
    };
    await db.insert(projects).values(row);
    return row;
  });
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
  return withDatabase(databaseUrl, async (client) => {
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
}

export async function listArtifacts(
  databaseUrl: string,
  actor?: Principal,
  filter?: { project?: string; type?: string },
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
    const filtered = type ? rows.filter((row) => row.type === type) : rows;
    const result: ArtifactRecord[] = [];
    for (const row of filtered) {
      result.push(await loadArtifact(client, row.key));
    }
    return result;
  });
}

export async function getArtifact(databaseUrl: string, key: string, actor?: Principal): Promise<ArtifactRecord> {
  await requirePermission(databaseUrl, actor, "artifact:view");
  return withDatabase(databaseUrl, async (client) => loadArtifact(client, key.trim().toUpperCase()));
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
    if (requirement.type !== "REQUIREMENT") {
      throw new ValidationError(`Traceability target must be a REQUIREMENT, got ${requirement.type}`);
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
  return withDatabase(databaseUrl, async (client) => {
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
  const rows = await client.sql<{ last_value: number }[]>`
    INSERT INTO artifact_key_counters (prefix, last_value)
    VALUES (${prefix}, 1)
    ON CONFLICT (prefix) DO UPDATE SET last_value = artifact_key_counters.last_value + 1
    RETURNING last_value
  `;
  const value = rows[0]?.last_value;
  if (value === undefined) {
    throw new ConflictError("Failed to allocate artifact key");
  }
  return `${prefix}-${String(value).padStart(3, "0")}`;
}

async function loadArtifact(client: DbClient, key: string): Promise<ArtifactRecord> {
  const artifact = (await client.db.select().from(artifacts).where(eq(artifacts.key, key)))[0];
  if (!artifact) {
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
