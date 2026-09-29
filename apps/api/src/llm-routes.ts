import type { FastifyInstance, FastifyRequest } from "fastify";
import { AuthorizationError, ValidationError, type Principal } from "@setwin/auth";
import {
  LLM_AGENTS,
  LLM_PROVIDERS,
  effectiveRoutesForSetup,
  isProviderName,
  writeStoredLlmRoutes,
  type StoredLlmRoute,
} from "@setwin/ai";

function actorOf(request: FastifyRequest): Principal | undefined {
  return (request as FastifyRequest & { actor?: Principal }).actor;
}

function requireAdmin(request: FastifyRequest): void {
  const actor = actorOf(request);
  if (!actor?.roles.includes("administrator")) {
    throw new AuthorizationError("Administrator role required");
  }
}

export function registerLlmRouteRoutes(app: FastifyInstance): void {
  app.get("/llm/routes", async (request) => {
    requireAdmin(request);
    return {
      agents: LLM_AGENTS,
      providers: LLM_PROVIDERS,
      routes: effectiveRoutesForSetup(),
    };
  });

  app.post("/llm/routes", async (request) => {
    requireAdmin(request);
    const body = request.body as { routes?: StoredLlmRoute[] };
    if (!Array.isArray(body?.routes)) {
      throw new ValidationError("routes is required");
    }
    const known = new Set<string>(LLM_AGENTS.map((row) => row.id));
    const routes: StoredLlmRoute[] = [];
    for (const row of body.routes) {
      const agent = String(row?.agent ?? "").trim().toLowerCase();
      const provider = String(row?.provider ?? "").trim().toLowerCase();
      const model = String(row?.model ?? "").trim();
      if (!known.has(agent)) {
        throw new ValidationError(`Unknown agent: ${agent || "(blank)"}`);
      }
      if (provider && !isProviderName(provider)) {
        throw new ValidationError(`Unknown provider: ${provider}`);
      }
      if (model.length > 200) {
        throw new ValidationError("Model id is too long");
      }
      routes.push({ agent, provider, model });
    }
    writeStoredLlmRoutes(routes);
    return { routes: effectiveRoutesForSetup() };
  });
}
