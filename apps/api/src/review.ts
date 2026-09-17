import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Principal } from "@setwin/auth";
import { getSettings } from "@setwin/config";
import {
  actionFromDecision,
  addReviewFinding,
  delegateApproval,
  escalateApproval,
  getReview,
  listApprovalPolicies,
  parseReviewDecision,
  recordReviewDecision,
} from "@setwin/twin";

declare module "fastify" {
  interface FastifyRequest {
    actor?: Principal;
  }
}

function actorOf(request: FastifyRequest): Principal | undefined {
  return request.actor;
}

export function registerReviewRoutes(app: FastifyInstance): void {
  app.get("/review/policies", async (request) => listApprovalPolicies(getSettings().databaseUrl, actorOf(request)));

  app.get("/artifacts/:key/review", async (request) => {
    const params = request.params as { key: string };
    return getReview(getSettings().databaseUrl, params.key, actorOf(request));
  });

  app.post("/artifacts/:key/review/findings", async (request, reply) => {
    const params = request.params as { key: string };
    const body = request.body as { summary?: string; severity?: string };
    if (!body?.summary) {
      return reply.code(400).send({ error: "summary is required" });
    }
    return addReviewFinding(
      getSettings().databaseUrl,
      params.key,
      { summary: body.summary, severity: body.severity ?? "INFO" },
      actorOf(request),
    );
  });

  app.post("/artifacts/:key/review/decide", async (request, reply) => {
    const params = request.params as { key: string };
    const body = request.body as { decision?: string; comment?: string };
    if (!body?.decision) {
      return reply.code(400).send({ error: "decision is required" });
    }
    return recordReviewDecision(
      getSettings().databaseUrl,
      params.key,
      actionFromDecision(parseReviewDecision(body.decision)),
      actorOf(request),
      body.comment,
    );
  });

  app.post("/artifacts/:key/review/delegate", async (request, reply) => {
    const params = request.params as { key: string };
    const body = request.body as { username?: string; role?: string };
    if (!body?.username) {
      return reply.code(400).send({ error: "username is required" });
    }
    return delegateApproval(
      getSettings().databaseUrl,
      params.key,
      { to: body.username, role: body.role },
      actorOf(request),
    );
  });

  app.post("/artifacts/:key/review/escalate", async (request, reply) => {
    const params = request.params as { key: string };
    const body = request.body as { role?: string; username?: string };
    if (!body?.role) {
      return reply.code(400).send({ error: "role is required" });
    }
    return escalateApproval(
      getSettings().databaseUrl,
      params.key,
      { toRole: body.role, to: body.username },
      actorOf(request),
    );
  });
}
