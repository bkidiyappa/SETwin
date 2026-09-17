import { createInterface } from "node:readline";
import { getSettings } from "@setwin/config";
import { authenticate } from "@setwin/auth";
import { listAuditEvents } from "@setwin/audit";
import { buildStatus } from "@setwin/core";
import { createRequirement, showRequirement } from "@setwin/requirements";
import { getArtifact, listArtifacts, listProjects } from "@setwin/twin";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

async function actorFromEnv() {
  const token = process.env.SETWIN_TOKEN;
  if (!token) {
    throw new Error("SETWIN_TOKEN is required for MCP domain calls");
  }
  return authenticate(getSettings().databaseUrl, token);
}

function ok(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function fail(id: string | number | null | undefined, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code: -32000, message } };
}

export async function handleMcpRequest(request: JsonRpcRequest): Promise<unknown> {
  const settings = getSettings();
  switch (request.method) {
    case "initialize":
      return ok(request.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: "setwin", version: "0.1.0" },
      });
    case "tools/list":
      return ok(request.id, {
        tools: [
          { name: "list_projects", description: "List SETwin projects", inputSchema: { type: "object", properties: {} } },
          {
            name: "list_artifacts",
            description: "List artifacts for a project",
            inputSchema: { type: "object", properties: { project: { type: "string" } }, required: ["project"] },
          },
          {
            name: "show_artifact",
            description: "Show an artifact by key",
            inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
          },
          {
            name: "create_requirement",
            description: "Create a requirement DRAFT",
            inputSchema: {
              type: "object",
              properties: { project: { type: "string" }, text: { type: "string" }, title: { type: "string" } },
              required: ["project", "text"],
            },
          },
          {
            name: "list_audit",
            description: "List recent audit events",
            inputSchema: { type: "object", properties: { limit: { type: "number" } } },
          },
        ],
      });
    case "tools/call": {
      const actor = await actorFromEnv();
      const params = request.params ?? {};
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Record<string, string | number>;
      let payload: unknown;
      if (name === "list_projects") {
        payload = await listProjects(settings.databaseUrl, actor);
      } else if (name === "list_artifacts") {
        payload = await listArtifacts(settings.databaseUrl, actor, { project: String(args.project) });
      } else if (name === "show_artifact") {
        payload = await getArtifact(settings.databaseUrl, String(args.key), actor);
      } else if (name === "create_requirement") {
        payload = await createRequirement(
          settings.databaseUrl,
          {
            project: String(args.project),
            text: String(args.text),
            title: args.title ? String(args.title) : undefined,
          },
          actor,
        );
      } else if (name === "list_audit") {
        payload = await listAuditEvents(settings.databaseUrl, {
          limit: typeof args.limit === "number" ? args.limit : 20,
        });
      } else {
        return fail(request.id, `Unknown tool: ${name}`);
      }
      return ok(request.id, { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] });
    }
    case "resources/list":
      return ok(request.id, {
        resources: [{ uri: "setwin://status", name: "SETwin status", mimeType: "application/json" }],
      });
    case "resources/read": {
      const uri = String((request.params ?? {}).uri ?? "");
      if (uri !== "setwin://status") {
        return fail(request.id, `Unknown resource: ${uri}`);
      }
      const status = await buildStatus();
      return ok(request.id, {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(status, null, 2) }],
      });
    }
    case "prompts/list":
      return ok(request.id, {
        prompts: [
          {
            name: "requirement_to_gherkin",
            description: "Guide for turning a requirement into DRAFT Gherkin via SETwin",
            arguments: [{ name: "key", description: "Requirement key", required: true }],
          },
        ],
      });
    case "prompts/get": {
      const actor = await actorFromEnv();
      const key = String(((request.params ?? {}).arguments as { key?: string } | undefined)?.key ?? "REQ-001");
      const requirement = await showRequirement(settings.databaseUrl, key, actor);
      return ok(request.id, {
        description: "Requirement to Gherkin draft guidance",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Use SETwin to generate DRAFT Gherkin for ${requirement.key}. Do not auto-approve.\n\n${requirement.currentVersion.content}`,
            },
          },
        ],
      });
    }
    case "notifications/initialized":
      return ok(request.id, {});
    default:
      return fail(request.id, `Unsupported method: ${request.method}`);
  }
}

export async function startMcpServer(): Promise<void> {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(line) as JsonRpcRequest;
    } catch {
      process.stdout.write(`${JSON.stringify(fail(null, "Invalid JSON"))}\n`);
      continue;
    }
    const response = await handleMcpRequest(request);
    process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}
