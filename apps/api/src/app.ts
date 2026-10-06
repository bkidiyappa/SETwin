import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { AuthenticationError, AuthorizationError } from "@setwin/auth";
import {
  VERSION,
  getLogger,
  getSettings,
  setCorrelationId,
  setupLogging,
} from "@setwin/config";
import { buildStatus } from "@setwin/core";
import { applyMigrations, checkDatabase } from "@setwin/database";
import { registerIdentityRoutes } from "./identity.ts";
import { registerTwinRoutes } from "./twin.ts";
import { registerGherkinRoutes } from "./gherkin.ts";
import { registerWorkflowRoutes } from "./workflow.ts";
import { registerReviewRoutes } from "./review.ts";
import { registerPhaseRoutes } from "./phases.ts";
import { registerTestPlanRoutes } from "./test-plans.ts";
import { registerAttachmentRoutes } from "./attachments.ts";
import { registerLlmRouteRoutes } from "./llm-routes.ts";

function explainError(error: unknown): { statusCode: number; message: string } {
  const seen = new Set<unknown>();
  let current: unknown = error;
  let message = "";
  let statusCode = 500;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const row = current as { statusCode?: unknown; message?: unknown; cause?: unknown };
    const text = typeof row.message === "string" ? row.message.trim() : "";
    if (text && text !== "Internal Server Error" && !message) {
      message = text.length > 800 ? `${text.slice(0, 800)}…` : text;
    }
    if (typeof row.statusCode === "number" && row.statusCode >= 400 && row.statusCode < 500) {
      statusCode = row.statusCode;
    }
    current = row.cause;
  }
  if (!message) {
    message = "Internal error";
  }
  if (statusCode >= 500) {
    if (/timed out|timeout|aborted/i.test(message)) {
      statusCode = 504;
    } else {
      message = "Internal error";
    }
  }
  return { statusCode, message };
}
export function createApp() {
  const settings = getSettings();
  setupLogging(settings.logLevel);
  const app = Fastify({ logger: false });

  app.addHook("onRequest", async (request, reply) => {
    const correlationId = (request.headers["x-correlation-id"] as string | undefined) ?? randomUUID();
    setCorrelationId(correlationId);
    reply.header("x-correlation-id", correlationId);
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    const origin = request.headers.origin;
    const allowed = getSettings().webOrigins;
    if (typeof origin === "string" && allowed.includes(origin)) {
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-credentials", "true");
      reply.header("vary", "Origin");
    }
    reply.header("access-control-allow-headers", "authorization, content-type, x-correlation-id");
    reply.header("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  });

  app.options("/*", async (_request, reply) => reply.code(204).send());

  app.setErrorHandler((error, _request, reply) => {
    const explained = explainError(error);
    if (explained.statusCode >= 500) {
      getLogger().error({ err: error }, "unhandled error");
    }
    return reply.code(explained.statusCode).send({ error: explained.message });
  });

  app.get("/health", async (_request, reply) => {
    const database = await checkDatabase(getSettings().databaseUrl);
    const status = database.reachable ? "ok" : "down";
    return reply.code(database.reachable ? 200 : 503).send({
      status,
      name: "SETwin",
      version: VERSION,
      databaseReachable: database.reachable,
    });
  });

  registerIdentityRoutes(app);
  registerTwinRoutes(app);
  registerGherkinRoutes(app);
  registerWorkflowRoutes(app);
  registerReviewRoutes(app);
  registerPhaseRoutes(app);
  registerTestPlanRoutes(app);
  registerAttachmentRoutes(app);
  registerLlmRouteRoutes(app);

  app.get("/status", async (request) => {
    const actor = request.actor;
    if (!actor) {
      throw new AuthenticationError();
    }
    if (!actor.roles.includes("administrator")) {
      throw new AuthorizationError();
    }
    getLogger().debug("status requested");
    return buildStatus();
  });

  return app;
}

export async function startServer(): Promise<void> {
  const settings = getSettings();
  await applyMigrations(settings.databaseUrl);
  const app = createApp();
  getLogger().info({ host: settings.apiHost, port: settings.apiPort }, "starting api");
  await app.listen({ host: settings.apiHost, port: settings.apiPort });
}
