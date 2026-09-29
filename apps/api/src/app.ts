import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import {
  VERSION,
  getLogger,
  getSettings,
  setCorrelationId,
  setupLogging,
} from "@setwin/config";
import { buildStatus } from "@setwin/core";
import { applyMigrations } from "@setwin/database";
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
  if (statusCode >= 500 && /timed out|timeout|aborted/i.test(message)) {
    statusCode = 504;
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
    reply.header("access-control-allow-origin", "*");
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

  app.get("/health", async () => ({
    status: "ok",
    name: "SETwin",
    version: VERSION,
  }));

  app.get("/status", async () => {
    getLogger().debug("status requested");
    return buildStatus();
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

  return app;
}

export async function startServer(): Promise<void> {
  const settings = getSettings();
  await applyMigrations(settings.databaseUrl);
  const app = createApp();
  getLogger().info({ host: settings.apiHost, port: settings.apiPort }, "starting api");
  await app.listen({ host: settings.apiHost, port: settings.apiPort });
}
