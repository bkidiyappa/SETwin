import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Principal } from "@setwin/auth";
import { getSettings } from "@setwin/config";
import { getWorkflow, listWorkflowPolicies, transitionWorkflow } from "@setwin/twin";

declare module "fastify" {
  interface FastifyRequest {
    actor?: Principal;
  }
}

function actorOf(request: FastifyRequest): Principal | undefined {
  return request.actor;
}

export function registerWorkflowRoutes(app: FastifyInstance): void {
  app.get("/workflow/policies", async (request) => listWorkflowPolicies(getSettings().databaseUrl, actorOf(request)));

  app.get("/artifacts/:key/workflow", async (request) => {
    const params = request.params as { key: string };
    return getWorkflow(getSettings().databaseUrl, params.key, actorOf(request));
  });

  app.post("/artifacts/:key/workflow", async (request, reply) => {
    const params = request.params as { key: string };
    const body = request.body as { action?: string; comment?: string; dueAt?: string };
    if (!body?.action) {
      return reply.code(400).send({ error: "action is required" });
    }
    const dueAt = body.dueAt ? new Date(body.dueAt) : undefined;
    if (dueAt && Number.isNaN(dueAt.getTime())) {
      return reply.code(400).send({ error: "dueAt must be an ISO-8601 date" });
    }
    return transitionWorkflow(getSettings().databaseUrl, params.key, body.action, actorOf(request), body.comment, {
      dueAt,
    });
  });
}
