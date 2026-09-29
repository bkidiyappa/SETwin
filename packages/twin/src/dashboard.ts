import { and, count, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requirePermission, type Principal } from "@setwin/auth";
import {
  artifactRelationships,
  artifactVersions,
  artifacts,
  codeRepositories,
  projects,
  withDatabase,
} from "@setwin/database";

export type ProjectDashboardStats = {
  key: string;
  name: string;
  description: string;
  features: number;
  repositories: number;
  stories: number;
  implementedStories: number;
  storiesInReview: number;
  designs: number;
  designsApproved: number;
  code: number;
  codeApproved: number;
  tests: number;
  testsApproved: number;
  testsInReview: number;
};

type SlimArtifact = {
  projectId: string;
  key: string;
  type: string;
  workflowState: string;
};

type SlimLink = {
  projectId: string;
  fromKey: string;
  toKey: string;
};

const STORY_TYPES = new Set(["STORY", "REQUIREMENT"]);
const DESIGN_TYPES = new Set(["DESIGN", "ARCHITECTURE"]);
const CODE_TYPES = new Set(["CODE"]);
const TEST_TYPES = new Set(["TEST", "GHERKIN"]);

function linkedKeys(key: string, relationships: Array<{ from: string; to: string }>): Set<string> {
  const target = key.toUpperCase();
  const related = new Set<string>();
  for (const rel of relationships) {
    if (rel.from.toUpperCase() === target) {
      related.add(rel.to.toUpperCase());
    }
    if (rel.to.toUpperCase() === target) {
      related.add(rel.from.toUpperCase());
    }
  }
  return related;
}

function implementedStoryCount(
  stories: SlimArtifact[],
  designs: SlimArtifact[],
  codes: SlimArtifact[],
  tests: SlimArtifact[],
  relationships: Array<{ from: string; to: string }>,
): number {
  let implemented = 0;
  for (const story of stories) {
    const related = linkedKeys(story.key, relationships);
    related.add(story.key.toUpperCase());
    for (const design of designs) {
      if (!related.has(design.key.toUpperCase())) {
        continue;
      }
      for (const key of linkedKeys(design.key, relationships)) {
        related.add(key);
      }
    }
    const storyCode = codes.filter((row) => related.has(row.key.toUpperCase()));
    const storyTests = tests.filter((row) => related.has(row.key.toUpperCase()));
    const codeDone = storyCode.length > 0 && storyCode.every((row) => row.workflowState === "APPROVED");
    const testsDone = storyTests.length > 0 && storyTests.every((row) => row.workflowState === "APPROVED");
    if (codeDone && testsDone) {
      implemented += 1;
    }
  }
  return implemented;
}

export function summarizeProjectDashboard(input: {
  projects: Array<{ id: string; key: string; name: string; description: string }>;
  artifacts: SlimArtifact[];
  relationships: SlimLink[];
  repositoryCounts: Map<string, number>;
}): ProjectDashboardStats[] {
  return input.projects.map((project) => {
    const rows = input.artifacts.filter((row) => row.projectId === project.id);
    const stories = rows.filter((row) => STORY_TYPES.has(row.type));
    const designs = rows.filter((row) => DESIGN_TYPES.has(row.type));
    const codes = rows.filter((row) => CODE_TYPES.has(row.type));
    const tests = rows.filter((row) => TEST_TYPES.has(row.type));
    const links = input.relationships
      .filter((row) => row.projectId === project.id)
      .map((row) => ({ from: row.fromKey, to: row.toKey }));
    const approved = (list: SlimArtifact[]) => list.filter((row) => row.workflowState === "APPROVED").length;
    const inReview = (list: SlimArtifact[]) => list.filter((row) => row.workflowState === "IN_REVIEW").length;
    return {
      key: project.key,
      name: project.name,
      description: project.description,
      features: rows.filter((row) => row.type === "FEATURE").length,
      repositories: input.repositoryCounts.get(project.id) ?? 0,
      stories: stories.length,
      implementedStories: implementedStoryCount(stories, designs, codes, tests, links),
      storiesInReview: inReview(stories),
      designs: designs.length,
      designsApproved: approved(designs),
      code: codes.length,
      codeApproved: approved(codes),
      tests: tests.length,
      testsApproved: approved(tests),
      testsInReview: inReview(tests),
    };
  });
}

/** Counts for every product in a few queries. Does not load artifact bodies. */
export async function listProjectDashboard(
  databaseUrl: string,
  actor?: Principal,
): Promise<ProjectDashboardStats[]> {
  await requirePermission(databaseUrl, actor, "project:view");
  return withDatabase(databaseUrl, async ({ db }) => {
    const projectRows = await db
      .select({
        id: projects.id,
        key: projects.key,
        name: projects.name,
        description: projects.description,
      })
      .from(projects);
    const artifactRows = await db
      .select({
        projectId: artifacts.projectId,
        key: artifacts.key,
        type: artifacts.type,
        workflowState: artifactVersions.workflowState,
      })
      .from(artifacts)
      .innerJoin(artifactVersions, eq(artifactVersions.id, artifacts.currentVersionId))
      .where(isNull(artifacts.deletedAt));
    const fromArtifact = alias(artifacts, "from_artifact");
    const toArtifact = alias(artifacts, "to_artifact");
    const relationshipRows = await db
      .select({
        projectId: fromArtifact.projectId,
        fromKey: fromArtifact.key,
        toKey: toArtifact.key,
      })
      .from(artifactRelationships)
      .innerJoin(fromArtifact, eq(fromArtifact.id, artifactRelationships.fromArtifactId))
      .innerJoin(toArtifact, eq(toArtifact.id, artifactRelationships.toArtifactId))
      .where(and(isNull(fromArtifact.deletedAt), isNull(toArtifact.deletedAt)));
    const repositoryRows = await db
      .select({ projectId: codeRepositories.projectId, total: count() })
      .from(codeRepositories)
      .groupBy(codeRepositories.projectId);
    const repositoryCounts = new Map(repositoryRows.map((row) => [row.projectId, Number(row.total)]));
    const summarized = summarizeProjectDashboard({
      projects: projectRows,
      artifacts: artifactRows,
      relationships: relationshipRows,
      repositoryCounts,
    });
    summarized.sort((a, b) => a.key.localeCompare(b.key));
    return summarized;
  });
}
