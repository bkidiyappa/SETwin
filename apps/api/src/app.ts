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
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@setwin/auth";
import { registerIdentityRoutes } from "./identity.ts";
import { registerTwinRoutes } from "./twin.ts";
import { registerGherkinRoutes } from "./gherkin.ts";
import { registerWorkflowRoutes } from "./workflow.ts";
import { registerReviewRoutes } from "./review.ts";
import { registerPhaseRoutes } from "./phases.ts";

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
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError ||
      error instanceof ConflictError ||
      error instanceof NotFoundError ||
      error instanceof ValidationError
    ) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    getLogger().error({ err: error }, "unhandled error");
    return reply.code(500).send({ error: "Internal error" });
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

  return app;
}

export async function startServer(): Promise<void> {
  const settings = getSettings();
  const app = createApp();
  getLogger().info({ host: settings.apiHost, port: settings.apiPort }, "starting api");
  await app.listen({ host: settings.apiHost, port: settings.apiPort });
}
