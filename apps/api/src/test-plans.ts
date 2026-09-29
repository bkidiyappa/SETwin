import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Principal } from "@setwin/auth";
import { getSettings } from "@setwin/config";
import { listRepositories, recallCodeNeighborhood } from "@setwin/repo";
import {
  createTestPlan,
  extractSourcePaths,
  getTestPlan,
  listProjectPipeline,
  listTestPlans,
  rebaselineMasterTestPlan,
  releaseTestPlan,
  renameTestPlan,
} from "@setwin/twin";

function actorOf(request: FastifyRequest): Principal | undefined {
  return request.actor;
}

export function registerTestPlanRoutes(app: FastifyInstance): void {
  app.get("/test-plans", async (request) => {
    const query = request.query as { includeReleased?: string };
    return listTestPlans(getSettings().databaseUrl, actorOf(request), query.includeReleased === "1");
  });

  app.get("/test-plans/:id", async (request) => {
    const params = request.params as { id: string };
    const actor = actorOf(request);
    const databaseUrl = getSettings().databaseUrl;
    const plan = await getTestPlan(databaseUrl, params.id, actor);
    if (plan.kind === "MASTER") {
      return rebaselineMasterTestPlan(databaseUrl, params.id, actor, { touch: false });
    }
    return plan;
  });

  app.post("/test-plans/:id/rebaseline", async (request) => {
    const params = request.params as { id: string };
    return rebaselineMasterTestPlan(getSettings().databaseUrl, params.id, actorOf(request), { touch: true });
  });

  app.patch("/test-plans/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as { name?: string };
    if (!body?.name?.trim()) {
      return reply.code(400).send({ error: "name is required" });
    }
    return renameTestPlan(getSettings().databaseUrl, params.id, body.name, actorOf(request));
  });

  app.post("/test-plans/:id/release", async (request) => {
    const params = request.params as { id: string };
    return releaseTestPlan(getSettings().databaseUrl, params.id, actorOf(request));
  });

  app.post("/projects/:key/test-plans", async (request, reply) => {
    const params = request.params as { key: string };
    const body = request.body as { since?: string };
    if (!body?.since) {
      return reply.code(400).send({ error: "since is required" });
    }
    const actor = actorOf(request);
    const databaseUrl = getSettings().databaseUrl;
    const since = new Date(body.since);
    let neighborFiles: string[] = [];
    if (!Number.isNaN(since.getTime())) {
      try {
        const loaded = await listProjectPipeline(databaseUrl, params.key, actor);
        const paths = loaded.artifacts
          .filter((row) => row.type === "CODE" && row.currentVersion.provenance.createdAt.getTime() >= since.getTime())
          .flatMap((row) => extractSourcePaths(row.currentVersion.content));
        if (paths.length) {
          const repos = await listRepositories(databaseUrl, actor, { project: params.key });
          if (repos.length) {
            const memory = await recallCodeNeighborhood(databaseUrl, { project: params.key, filePaths: paths }, actor);
            neighborFiles = memory.neighborFiles;
          }
        }
      } catch {
        neighborFiles = [];
      }
    }
    return createTestPlan(databaseUrl, { project: params.key, since: body.since, neighborFiles }, actor);
  });
}
