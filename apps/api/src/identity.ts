import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  AuthenticationError,
  addTeamMember,
  assignRole,
  authenticate,
  createTeam,
  createUser,
  listRoles,
  listTeams,
  listUsers,
  login,
  type Principal,
} from "@setwin/auth";
import { getSettings } from "@setwin/config";

declare module "fastify" {
  interface FastifyRequest {
    actor?: Principal;
  }
}

function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  const query = request.query as { token?: string };
  if (typeof query?.token === "string" && query.token.trim()) {
    return query.token.trim();
  }
  return undefined;
}

export function registerIdentityRoutes(app: FastifyInstance): void {
  app.addHook("preHandler", async (request) => {
    const token = bearerToken(request);
    if (!token) {
      return;
    }
    // Ignore stale tokens on login so a reset DB does not block signing in again.
    if (request.method === "POST" && request.url.split("?")[0] === "/auth/login") {
      try {
        request.actor = await authenticate(getSettings().databaseUrl, token);
      } catch {
        request.actor = undefined;
      }
      return;
    }
    request.actor = await authenticate(getSettings().databaseUrl, token);
  });

  app.post("/auth/login", async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    if (!body?.username || !body.password) {
      return reply.code(400).send({ error: "username and password are required" });
    }
    const result = await login(getSettings().databaseUrl, body.username, body.password);
    return { token: result.token, user: result.user };
  });

  app.get("/auth/me", async (request) => {
    if (!request.actor) {
      throw new AuthenticationError();
    }
    return request.actor;
  });

  app.get("/users", async (request) => {
    return listUsers(getSettings().databaseUrl, request.actor);
  });

  app.post("/users", async (request, reply) => {
    const body = request.body as {
      username?: string;
      password?: string;
      displayName?: string;
      role?: string;
    };
    if (!body?.username || !body.password) {
      return reply.code(400).send({ error: "username and password are required" });
    }
    return createUser(
      getSettings().databaseUrl,
      {
        username: body.username,
        password: body.password,
        displayName: body.displayName,
        role: body.role,
      },
      request.actor,
    );
  });

  app.post("/users/:username/roles", async (request, reply) => {
    const params = request.params as { username: string };
    const body = request.body as { role?: string };
    if (!body?.role) {
      return reply.code(400).send({ error: "role is required" });
    }
    return assignRole(getSettings().databaseUrl, params.username, body.role, request.actor);
  });

  app.get("/roles", async () => listRoles(getSettings().databaseUrl));

  app.get("/teams", async (request) => listTeams(getSettings().databaseUrl, request.actor));

  app.post("/teams", async (request, reply) => {
    const body = request.body as { name?: string; description?: string };
    if (!body?.name) {
      return reply.code(400).send({ error: "name is required" });
    }
    return createTeam(getSettings().databaseUrl, { name: body.name, description: body.description }, request.actor);
  });

  app.post("/teams/:name/members", async (request, reply) => {
    const params = request.params as { name: string };
    const body = request.body as { username?: string };
    if (!body?.username) {
      return reply.code(400).send({ error: "username is required" });
    }
    await addTeamMember(getSettings().databaseUrl, params.name, body.username, request.actor);
    return { ok: true };
  });
}
