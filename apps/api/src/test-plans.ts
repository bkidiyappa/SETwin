import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Principal } from "@setwin/auth";
import { getSettings } from "@setwin/config";
import { automateTestPlanItem, runTestPlanScript, setTestAutomationLink } from "@setwin/opensecant";
import { listRepositories, recallCodeNeighborhood } from "@setwin/repo";
import {
  addTestPlanItem,
  createTestPlan,
  extractSourcePaths,
  getTestPlan,
  listProjectPipeline,
  listTestPlans,
  rebaselineMasterTestPlan,
  releaseTestPlan,
  removeTestPlanItem,
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

  app.post("/test-plans/:id/items", async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as { key?: string; lane?: string };
    if (!body?.key?.trim() || !body?.lane?.trim()) {
      return reply.code(400).send({ error: "key and lane are required" });
    }
    return addTestPlanItem(getSettings().databaseUrl, params.id, { key: body.key, lane: body.lane }, actorOf(request));
  });

  app.delete("/test-plans/:id/items/:key", async (request) => {
    const params = request.params as { id: string; key: string };
    return removeTestPlanItem(getSettings().databaseUrl, params.id, params.key, actorOf(request));
  });

  app.post("/test-plans/:id/items/:key/automate", async (request) => {
    const params = request.params as { id: string; key: string };
    return automateTestPlanItem(getSettings().databaseUrl, params.id, decodeURIComponent(params.key), actorOf(request));
  });

  app.patch("/test-plans/:id/items/:key/automation", async (request, reply) => {
    const params = request.params as { id: string; key: string };
    const body = request.body as { scriptPath?: string };
    if (body?.scriptPath == null) {
      return reply.code(400).send({ error: "scriptPath is required" });
    }
    return setTestAutomationLink(
      getSettings().databaseUrl,
      params.id,
      decodeURIComponent(params.key),
      body.scriptPath,
      actorOf(request),
    );
  });

  app.post("/test-plans/:id/automation/run", async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as { scriptPath?: string };
    if (!body?.scriptPath?.trim()) {
      return reply.code(400).send({ error: "scriptPath is required" });
    }
    return runTestPlanScript(getSettings().databaseUrl, params.id, body.scriptPath, actorOf(request));
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
