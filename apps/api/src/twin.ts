import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Principal } from "@setwin/auth";
import { getSettings } from "@setwin/config";

declare module "fastify" {
  interface FastifyRequest {
    actor?: Principal;
  }
}
import {
  createArtifact,
  createArtifactVersion,
  createProject,
  createRelationship,
  getArtifact,
  getProject,
  listArtifacts,
  listProjects,
  listRelationships,
} from "@setwin/twin";

function actorOf(request: FastifyRequest): Principal | undefined {
  return request.actor;
}

export function registerTwinRoutes(app: FastifyInstance): void {
  app.get("/projects", async (request) => listProjects(getSettings().databaseUrl, actorOf(request)));

  app.post("/projects", async (request, reply) => {
    const body = request.body as { key?: string; name?: string; description?: string };
    if (!body?.key) {
      return reply.code(400).send({ error: "key is required" });
    }
    return createProject(
      getSettings().databaseUrl,
      { key: body.key, name: body.name, description: body.description },
      actorOf(request),
    );
  });

  app.get("/projects/:key", async (request) => {
    const params = request.params as { key: string };
    return getProject(getSettings().databaseUrl, params.key, actorOf(request));
  });

  app.get("/artifacts", async (request) => {
    const query = request.query as { project?: string };
    return listArtifacts(getSettings().databaseUrl, actorOf(request), { project: query.project });
  });

  app.post("/artifacts", async (request, reply) => {
    const body = request.body as {
      project?: string;
      type?: string;
      title?: string;
      content?: string;
      provenanceSource?: string;
      provenanceAuthority?: string;
    };
    if (!body?.project || !body.type || !body.title) {
      return reply.code(400).send({ error: "project, type, and title are required" });
    }
    return createArtifact(
      getSettings().databaseUrl,
      {
        project: body.project,
        type: body.type,
        title: body.title,
        content: body.content,
        provenanceSource: body.provenanceSource,
        provenanceAuthority: body.provenanceAuthority,
      },
      actorOf(request),
    );
  });

  app.get("/artifacts/:key", async (request) => {
    const params = request.params as { key: string };
    return getArtifact(getSettings().databaseUrl, params.key, actorOf(request));
  });

  app.post("/artifacts/:key/versions", async (request) => {
    const params = request.params as { key: string };
    const body = (request.body as {
      title?: string;
      content?: string;
      provenanceSource?: string;
      provenanceAuthority?: string;
    }) ?? {};
    return createArtifactVersion(getSettings().databaseUrl, params.key, body, actorOf(request));
  });

  app.get("/artifacts/:key/relationships", async (request) => {
    const params = request.params as { key: string };
    return listRelationships(getSettings().databaseUrl, params.key, actorOf(request));
  });

  app.post("/relationships", async (request, reply) => {
    const body = request.body as {
      from?: string;
      to?: string;
      type?: string;
      source?: string;
      confidence?: number;
    };
    if (!body?.from || !body.to || !body.type) {
      return reply.code(400).send({ error: "from, to, and type are required" });
    }
    return createRelationship(
      getSettings().databaseUrl,
      {
        from: body.from,
        to: body.to,
        type: body.type,
        source: body.source,
        confidence: body.confidence,
      },
      actorOf(request),
    );
  });
}
