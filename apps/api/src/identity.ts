import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  SESSION_TTL_MS,
  addTeamMember,
  assignRole,
  authenticate,
  createTeam,
  createUser,
  listRoles,
  listTeams,
  listUsers,
  login,
  logout,
  type Principal,
} from "@setwin/auth";
import { getSettings } from "@setwin/config";
import { requireActor } from "./guard.ts";

declare module "fastify" {
  interface FastifyRequest {
    actor?: Principal;
  }
}

const SESSION_COOKIE = "setwin_session";

const loginBody = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const createUserBody = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  displayName: z.string().optional(),
  role: z.string().optional(),
});

function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    return token || undefined;
  }
  return undefined;
}

function readSessionCookie(request: FastifyRequest): string | undefined {
  const header = request.headers.cookie;
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      const value = rest.join("=").trim();
      return value ? decodeURIComponent(value) : undefined;
    }
  }
  return undefined;
}

function sessionToken(request: FastifyRequest): string | undefined {
  return readSessionCookie(request) || bearerToken(request);
}

function cookieSuffix(): string {
  return getSettings().cookieSecure ? "; Secure" : "";
}

function writeSessionCookie(reply: FastifyReply, token: string): void {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  reply.header(
    "set-cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${cookieSuffix()}`,
  );
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.header(
    "set-cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${cookieSuffix()}`,
  );
}

export function registerIdentityRoutes(app: FastifyInstance): void {
  app.addHook("preHandler", async (request) => {
    const token = sessionToken(request);
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
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "username and password are required" });
    }
    const result = await login(getSettings().databaseUrl, parsed.data.username, parsed.data.password, {
      ip: request.ip,
    });
    writeSessionCookie(reply, result.token);
    return { token: result.token, user: result.user };
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = sessionToken(request);
    if (token) {
      await logout(getSettings().databaseUrl, token);
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/auth/me", async (request) => requireActor(request));

  app.get("/users", async (request) => {
    return listUsers(getSettings().databaseUrl, request.actor);
  });

  app.post("/users", async (request, reply) => {
    const parsed = createUserBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "username and password are required" });
    }
    return createUser(getSettings().databaseUrl, parsed.data, request.actor);
  });

  app.post("/users/:username/roles", async (request, reply) => {
    const params = request.params as { username: string };
    const body = request.body as { role?: string };
    if (!body?.role) {
      return reply.code(400).send({ error: "role is required" });
    }
    return assignRole(getSettings().databaseUrl, params.username, body.role, request.actor);
  });

  app.get("/roles", async (request) => {
    requireActor(request);
    return listRoles(getSettings().databaseUrl);
  });

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
