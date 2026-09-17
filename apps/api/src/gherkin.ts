import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Principal } from "@setwin/auth";
import { getSettings } from "@setwin/config";
import { createGherkin, getGherkin, listGherkin, parseGherkin } from "@setwin/twin";

declare module "fastify" {
  interface FastifyRequest {
    actor?: Principal;
  }
}

function actorOf(request: FastifyRequest): Principal | undefined {
  return request.actor;
}

export function registerGherkinRoutes(app: FastifyInstance): void {
  app.post("/gherkin/validate", async (request, reply) => {
    const body = request.body as { content?: string };
    if (!body?.content) {
      return reply.code(400).send({ error: "content is required" });
    }
    return parseGherkin(body.content);
  });

  app.get("/gherkin", async (request) => {
    const query = request.query as { project?: string };
    return listGherkin(getSettings().databaseUrl, actorOf(request), { project: query.project });
  });

  app.post("/gherkin", async (request, reply) => {
    const body = request.body as {
      project?: string;
      content?: string;
      title?: string;
      requirement?: string;
      provenanceSource?: string;
      provenanceAuthority?: string;
    };
    if (!body?.project || !body.content) {
      return reply.code(400).send({ error: "project and content are required" });
    }
    return createGherkin(
      getSettings().databaseUrl,
      {
        project: body.project,
        content: body.content,
        title: body.title,
        requirement: body.requirement,
        provenanceSource: body.provenanceSource,
        provenanceAuthority: body.provenanceAuthority,
      },
      actorOf(request),
    );
  });

  app.get("/gherkin/:key", async (request) => {
    const params = request.params as { key: string };
    return getGherkin(getSettings().databaseUrl, params.key, actorOf(request));
  });
}
