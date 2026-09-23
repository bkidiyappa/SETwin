import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Principal } from "@setwin/auth";
import { findProjectRoot, getSettings } from "@setwin/config";
import { getArtifact } from "@setwin/twin";

declare module "fastify" {
  interface FastifyRequest {
    actor?: Principal;
  }
}

type AttachmentMeta = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
};

function actorOf(request: FastifyRequest): Principal | undefined {
  return request.actor;
}

function attachmentsRoot(): string {
  const settings = getSettings();
  const root = path.isAbsolute(settings.dataDir)
    ? settings.dataDir
    : path.join(findProjectRoot(), settings.dataDir);
  return path.join(root, "attachments");
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

async function listForArtifact(artifactKey: string): Promise<AttachmentMeta[]> {
  const dir = path.join(attachmentsRoot(), artifactKey.toUpperCase());
  try {
    const names = await readdir(dir);
    const rows: AttachmentMeta[] = [];
    for (const name of names) {
      if (name.endsWith(".meta.json")) {
        continue;
      }
      const metaPath = path.join(dir, `${name}.meta.json`);
      try {
        const raw = await readFile(metaPath, "utf8");
        const meta = JSON.parse(raw) as AttachmentMeta;
        rows.push(meta);
      } catch {
        rows.push({
          id: name,
          name,
          mimeType: "application/octet-stream",
          size: 0,
          createdAt: new Date(0).toISOString(),
          url: `/attachments/${artifactKey.toUpperCase()}/${encodeURIComponent(name)}`,
        });
      }
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function registerAttachmentRoutes(app: FastifyInstance): void {
  app.get("/artifacts/:key/attachments", async (request) => {
    const params = request.params as { key: string };
    await getArtifact(getSettings().databaseUrl, params.key, actorOf(request));
    return { attachments: await listForArtifact(params.key) };
  });

  app.post("/artifacts/:key/attachments", async (request, reply) => {
    const params = request.params as { key: string };
    const body = request.body as {
      name?: string;
      mimeType?: string;
      dataBase64?: string;
      referenceUrl?: string;
      referenceLabel?: string;
    };

    const artifact = await getArtifact(getSettings().databaseUrl, params.key, actorOf(request));
    const dir = path.join(attachmentsRoot(), artifact.key);
    await mkdir(dir, { recursive: true });

    if (body.referenceUrl?.trim()) {
      const label = (body.referenceLabel || body.referenceUrl).trim().slice(0, 200);
      const id = `ref-${Date.now().toString(36)}`;
      const meta: AttachmentMeta = {
        id,
        name: label,
        mimeType: "text/uri-list",
        size: 0,
        createdAt: new Date().toISOString(),
        url: body.referenceUrl.trim(),
      };
      await writeFile(path.join(dir, `${id}.meta.json`), JSON.stringify(meta, null, 2), "utf8");
      return meta;
    }

    if (!body?.name || !body.dataBase64) {
      return reply.code(400).send({ error: "name and dataBase64 are required (or referenceUrl)" });
    }

    const raw = body.dataBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(raw, "base64");
    if (buffer.length > 8 * 1024 * 1024) {
      return reply.code(400).send({ error: "Attachment exceeds 8MB limit" });
    }
    const id = `${Date.now().toString(36)}-${safeName(body.name)}`;
    await writeFile(path.join(dir, id), buffer);
    const meta: AttachmentMeta = {
      id,
      name: body.name,
      mimeType: body.mimeType || "application/octet-stream",
      size: buffer.length,
      createdAt: new Date().toISOString(),
      url: `/attachments/${artifact.key}/${encodeURIComponent(id)}`,
    };
    await writeFile(path.join(dir, `${id}.meta.json`), JSON.stringify(meta, null, 2), "utf8");
    return meta;
  });

  app.get("/attachments/:artifactKey/:fileId", async (request, reply) => {
    const params = request.params as { artifactKey: string; fileId: string };
    await getArtifact(getSettings().databaseUrl, params.artifactKey, actorOf(request));
    const filePath = path.join(attachmentsRoot(), params.artifactKey.toUpperCase(), params.fileId);
    try {
      const metaRaw = await readFile(`${filePath}.meta.json`, "utf8");
      const meta = JSON.parse(metaRaw) as AttachmentMeta;
      if (meta.mimeType === "text/uri-list") {
        return reply.redirect(meta.url);
      }
      const data = await readFile(filePath);
      return reply.type(meta.mimeType || "application/octet-stream").send(data);
    } catch {
      return reply.code(404).send({ error: "Attachment not found" });
    }
  });

  app.delete("/artifacts/:key/attachments/:fileId", async (request, reply) => {
    const params = request.params as { key: string; fileId: string };
    const artifact = await getArtifact(getSettings().databaseUrl, params.key, actorOf(request));
    const state = artifact.currentVersion.workflowState;
    if (state !== "DRAFT" && state !== "REJECTED" && state !== "CHANGES_REQUESTED") {
      return reply.code(400).send({ error: "Attachments can only be removed before submit (DRAFT) or while revising" });
    }
    const dir = path.join(attachmentsRoot(), artifact.key.toUpperCase());
    const fileId = decodeURIComponent(params.fileId);
    const filePath = path.join(dir, fileId);
    const metaPath = `${filePath}.meta.json`;
    try {
      await unlink(metaPath).catch(() => undefined);
      await unlink(filePath).catch(() => undefined);
      return { deleted: true, id: fileId };
    } catch {
      return reply.code(404).send({ error: "Attachment not found" });
    }
  });
}
