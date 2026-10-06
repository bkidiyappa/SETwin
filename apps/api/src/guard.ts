import type { FastifyRequest } from "fastify";
import { AuthenticationError, type Principal } from "@setwin/auth";

declare module "fastify" {
  interface FastifyRequest {
    actor?: Principal;
  }
}

export function requireActor(request: FastifyRequest): Principal {
  if (!request.actor) {
    throw new AuthenticationError();
  }
  return request.actor;
}
