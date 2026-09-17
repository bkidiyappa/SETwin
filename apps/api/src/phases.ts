import { getAuditEvent, listAuditEvents, verifyAuditChain } from "@setwin/audit";
import { completeViaGateway, listAiActions } from "@setwin/ai";
import { createRequirement, generateGherkinDraft, showRequirement } from "@setwin/requirements";
import { indexRepository, listRepositories, listSymbols, registerRepository } from "@setwin/repo";
import { analyzeChange, getChangeAnalysis } from "@setwin/change";
import { getGraphNeighborhood, indexProjectContext, retrieveContext } from "@setwin/context";
import { invokeCodingAgent, listProposals, proposeAsRole } from "@setwin/agents";
import { ingestTestRun, listTestRuns, parseJunitLike } from "@setwin/testing";
import { listPipelineAdapters, renderPipelineTemplate, type PipelineProvider } from "@setwin/cicd";
import { executeGeneratedTests, generateTestsFromArtifact, ingestOpenSecantResults } from "@setwin/opensecant";
import { listEngineeringEvents, recordEngineeringEvent, visualizationSeries } from "@setwin/openvector";
import { listIntegrations, syncIntegrationStatus } from "@setwin/integrations";
import { NotFoundError, requirePermission, type Principal } from "@setwin/auth";
import { findExistingReview, listArtifacts } from "@setwin/twin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getSettings } from "@setwin/config";

function actorOf(request: FastifyRequest): Principal | undefined {
  return request.actor;
}

export function registerPhaseRoutes(app: FastifyInstance): void {
  app.get("/audit", async (request) => {
    await requirePermission(getSettings().databaseUrl, actorOf(request), "audit:view");
    const query = request.query as { entityKey?: string; action?: string; limit?: string };
    return listAuditEvents(getSettings().databaseUrl, {
      entityKey: query.entityKey,
      action: query.action,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  });
  app.get("/audit/:id", async (request) => {
    await requirePermission(getSettings().databaseUrl, actorOf(request), "audit:view");
    const params = request.params as { id: string };
    const row = await getAuditEvent(getSettings().databaseUrl, params.id);
    if (!row) {
      throw new NotFoundError(`Audit event not found: ${params.id}`);
    }
    return row;
  });
  app.get("/audit/verify", async () => verifyAuditChain(getSettings().databaseUrl));


  app.get("/ai/actions", async (request) => listAiActions(getSettings().databaseUrl, actorOf(request)));
  app.post("/ai/complete", async (request, reply) => {
    const body = request.body as { task?: string; prompt?: string; system?: string; model?: string };
    if (!body?.task || !body.prompt) {
      return reply.code(400).send({ error: "task and prompt are required" });
    }
    return completeViaGateway(getSettings().databaseUrl, body as never, actorOf(request));
  });

  app.post("/requirements", async (request, reply) => {
    const body = request.body as { project?: string; text?: string; title?: string };
    if (!body?.project || !body.text) {
      return reply.code(400).send({ error: "project and text are required" });
    }
    return createRequirement(getSettings().databaseUrl, body as never, actorOf(request));
  });
  app.get("/requirements/:key", async (request) => {
    const params = request.params as { key: string };
    return showRequirement(getSettings().databaseUrl, params.key, actorOf(request));
  });
  app.post("/requirements/:key/gherkin", async (request) => {
    const params = request.params as { key: string };
    return generateGherkinDraft(getSettings().databaseUrl, params.key, actorOf(request));
  });

  app.get("/repos", async (request) => listRepositories(getSettings().databaseUrl, actorOf(request)));
  app.post("/repos", async (request, reply) => {
    const body = request.body as { project?: string; path?: string };
    if (!body?.project || !body.path) {
      return reply.code(400).send({ error: "project and path are required" });
    }
    return registerRepository(getSettings().databaseUrl, body as never, actorOf(request));
  });
  app.post("/repos/:id/index", async (request) => {
    const params = request.params as { id: string };
    return indexRepository(getSettings().databaseUrl, params.id, actorOf(request));
  });
  app.get("/repos/:id/symbols", async (request) => {
    const params = request.params as { id: string };
    return listSymbols(getSettings().databaseUrl, params.id, actorOf(request));
  });

  app.post("/changes/analyze", async (request, reply) => {
    const body = request.body as { repositoryId?: string; baseRef?: string; headRef?: string };
    if (!body?.repositoryId || !body.baseRef || !body.headRef) {
      return reply.code(400).send({ error: "repositoryId, baseRef, and headRef are required" });
    }
    return analyzeChange(getSettings().databaseUrl, body as never, actorOf(request));
  });
  app.get("/changes/:id", async (request) => {
    const params = request.params as { id: string };
    return getChangeAnalysis(getSettings().databaseUrl, params.id, actorOf(request));
  });

  app.post("/context/index", async (request, reply) => {
    const body = request.body as { project?: string };
    if (!body?.project) {
      return reply.code(400).send({ error: "project is required" });
    }
    return indexProjectContext(getSettings().databaseUrl, body.project, actorOf(request));
  });
  app.post("/context/retrieve", async (request, reply) => {
    const body = request.body as { project?: string; query?: string; limit?: number };
    if (!body?.project || !body.query) {
      return reply.code(400).send({ error: "project and query are required" });
    }
    return retrieveContext(getSettings().databaseUrl, body as never, actorOf(request));
  });
  app.get("/context/graph/:key", async (request) => {
    const params = request.params as { key: string };
    return getGraphNeighborhood(getSettings().databaseUrl, params.key, actorOf(request));
  });

  app.post("/agents/propose", async (request, reply) => {
    const body = request.body as { project?: string; role?: string; topic?: string };
    if (!body?.project || !body.role || !body.topic) {
      return reply.code(400).send({ error: "project, role, and topic are required" });
    }
    return proposeAsRole(getSettings().databaseUrl, body as never, actorOf(request));
  });
  app.get("/agents/proposals", async (request) => listProposals(getSettings().databaseUrl, actorOf(request)));
  app.post("/agents/coding", async (request, reply) => {
    const body = request.body as { agent?: string; prompt?: string; workspacePath?: string };
    if (!body?.agent || !body.prompt) {
      return reply.code(400).send({ error: "agent and prompt are required" });
    }
    return invokeCodingAgent(getSettings().databaseUrl, body as never, actorOf(request));
  });

  app.get("/tests/runs", async (request) => listTestRuns(getSettings().databaseUrl, actorOf(request)));
  app.post("/tests/ingest", async (request, reply) => {
    const body = request.body as {
      project?: string;
      adapter?: string;
      suite?: string;
      results?: unknown[];
      junit?: string;
    };
    if (!body?.project || !body.adapter) {
      return reply.code(400).send({ error: "project and adapter are required" });
    }
    const results = body.junit
      ? parseJunitLike(body.junit)
      : ((body.results ?? []) as never);
    return ingestTestRun(
      getSettings().databaseUrl,
      { project: body.project, adapter: body.adapter, suite: body.suite, results },
      actorOf(request),
    );
  });

  app.get("/cicd/adapters", async () => listPipelineAdapters());
  app.get("/cicd/templates/:provider", async (request, reply) => {
    const params = request.params as { provider: PipelineProvider };
    try {
      return { provider: params.provider, template: renderPipelineTemplate(params.provider) };
    } catch {
      return reply.code(400).send({ error: "unknown provider" });
    }
  });

  app.post("/opensecant/generate", async (request, reply) => {
    const body = request.body as { key?: string; project?: string };
    if (!body?.key || !body.project) {
      return reply.code(400).send({ error: "key and project are required" });
    }
    return generateTestsFromArtifact(getSettings().databaseUrl, body as never, actorOf(request));
  });
  app.post("/opensecant/execute", async (request, reply) => {
    const body = request.body as { project?: string; scenarios?: string[] };
    if (!body?.project || !body.scenarios) {
      return reply.code(400).send({ error: "project and scenarios are required" });
    }
    return executeGeneratedTests(getSettings().databaseUrl, body as never, actorOf(request));
  });
  app.post("/opensecant/ingest", async (request, reply) => {
    const body = request.body as { project?: string; results?: unknown[] };
    if (!body?.project || !body.results) {
      return reply.code(400).send({ error: "project and results are required" });
    }
    return ingestOpenSecantResults(getSettings().databaseUrl, body as never, actorOf(request));
  });

  app.get("/metrics/events", async (request) => listEngineeringEvents(getSettings().databaseUrl, actorOf(request)));
  app.post("/metrics/events", async (request, reply) => {
    const body = request.body as { category?: string; name?: string; value?: number; project?: string };
    if (!body?.category || !body.name) {
      return reply.code(400).send({ error: "category and name are required" });
    }
    return recordEngineeringEvent(getSettings().databaseUrl, body as never, actorOf(request));
  });
  app.get("/metrics/series", async (request) => visualizationSeries(getSettings().databaseUrl, actorOf(request)));

  app.get("/integrations", async (request) => listIntegrations(getSettings().databaseUrl, actorOf(request)));
  app.post("/integrations/sync", async (request) => syncIntegrationStatus(getSettings().databaseUrl, actorOf(request)));

  app.get("/reviews", async (request) => {
    const artifacts = await listArtifacts(getSettings().databaseUrl, actorOf(request));
    const reviews = [];
    for (const artifact of artifacts) {
      const review = await findExistingReview(getSettings().databaseUrl, artifact.key, actorOf(request));
      if (review) {
        reviews.push({ ...review, artifactKey: artifact.key });
      }
    }
    return { reviews };
  });

  app.get("/approvals", async (request) => {
    const artifacts = await listArtifacts(getSettings().databaseUrl, actorOf(request));
    const approvals = [];
    for (const artifact of artifacts) {
      const review = await findExistingReview(getSettings().databaseUrl, artifact.key, actorOf(request));
      if (!review) {
        continue;
      }
      for (const req of review.requests) {
        approvals.push({
          artifactKey: artifact.key,
          requiredRole: req.requiredRole,
          status: req.status,
          dueAt: req.dueAt,
        });
      }
    }
    return { approvals };
  });
}
