import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@setwin/audit";
import { requirePermission, type Principal } from "@setwin/auth";
import { integrationConnections, withDatabase } from "@setwin/database";

export const INTEGRATION_PROVIDERS = [
  "jira",
  "ado",
  "confluence",
  "github",
  "gitlab",
  "bitbucket",
  "figma",
  "oidc",
  "saml",
] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

type ProviderConfig = {
  envKeys: string[];
  defaultBaseUrl: string;
  probePath?: string;
};

const CONFIG: Record<IntegrationProvider, ProviderConfig> = {
  jira: { envKeys: ["SETWIN_JIRA_BASE_URL", "SETWIN_JIRA_TOKEN"], defaultBaseUrl: "", probePath: "/rest/api/3/myself" },
  ado: {
    envKeys: ["SETWIN_ADO_ORG_URL", "SETWIN_ADO_TOKEN"],
    defaultBaseUrl: "",
    probePath: "/_apis/projects?api-version=7.1",
  },
  confluence: {
    envKeys: ["SETWIN_CONFLUENCE_BASE_URL", "SETWIN_CONFLUENCE_TOKEN"],
    defaultBaseUrl: "",
    probePath: "/wiki/rest/api/user/current",
  },
  github: { envKeys: ["SETWIN_GITHUB_TOKEN"], defaultBaseUrl: "https://api.github.com", probePath: "/user" },
  gitlab: {
    envKeys: ["SETWIN_GITLAB_TOKEN"],
    defaultBaseUrl: process.env.SETWIN_GITLAB_BASE_URL ?? "https://gitlab.com/api/v4",
    probePath: "/user",
  },
  bitbucket: {
    envKeys: ["SETWIN_BITBUCKET_TOKEN"],
    defaultBaseUrl: "https://api.bitbucket.org/2.0",
    probePath: "/user",
  },
  figma: { envKeys: ["SETWIN_FIGMA_TOKEN"], defaultBaseUrl: "https://api.figma.com/v1", probePath: "/me" },
  oidc: { envKeys: ["SETWIN_OIDC_ISSUER", "SETWIN_OIDC_CLIENT_ID"], defaultBaseUrl: "", probePath: "/.well-known/openid-configuration" },
  saml: { envKeys: ["SETWIN_SAML_METADATA_URL"], defaultBaseUrl: "", probePath: undefined },
};

export async function syncIntegrationStatus(
  databaseUrl: string,
  actor?: Principal,
): Promise<Array<{ provider: string; configured: boolean; status: string; baseUrl: string }>> {
  const principal = await requirePermission(databaseUrl, actor, "integration:manage");
  const results = [];
  for (const provider of INTEGRATION_PROVIDERS) {
    const status = await probeProvider(provider);
    await withDatabase(databaseUrl, async ({ db }) => {
      const existing = (
        await db.select().from(integrationConnections).where(eq(integrationConnections.provider, provider))
      )[0];
      if (existing) {
        await db
          .update(integrationConnections)
          .set({
            baseUrl: status.baseUrl,
            configured: status.configured,
            status: status.status,
            lastCheckedAt: new Date(),
            metadataJson: JSON.stringify(status.metadata),
          })
          .where(eq(integrationConnections.id, existing.id));
      } else {
        await db.insert(integrationConnections).values({
          id: randomUUID(),
          provider,
          baseUrl: status.baseUrl,
          configured: status.configured,
          status: status.status,
          lastCheckedAt: new Date(),
          metadataJson: JSON.stringify(status.metadata),
          createdAt: new Date(),
        });
      }
    });
    results.push({
      provider,
      configured: status.configured,
      status: status.status,
      baseUrl: status.baseUrl,
    });
  }
  await recordAuditEvent(databaseUrl, {
    action: "integration.sync",
    entityType: "integrations",
    entityId: "all",
    entityKey: "enterprise",
    after: { count: results.length },
    actor: principal,
  });
  return results;
}

export async function listIntegrations(
  databaseUrl: string,
  actor?: Principal,
): Promise<Array<{ provider: string; configured: boolean; status: string; baseUrl: string }>> {
  await requirePermission(databaseUrl, actor, "integration:view");
  return withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db.select().from(integrationConnections);
    if (rows.length === 0) {
      return INTEGRATION_PROVIDERS.map((provider) => ({
        provider,
        configured: isConfigured(provider),
        status: isConfigured(provider) ? "configured" : "unconfigured",
        baseUrl: resolveBaseUrl(provider),
      }));
    }
    return rows.map((row) => ({
      provider: row.provider,
      configured: row.configured,
      status: row.status,
      baseUrl: row.baseUrl,
    }));
  });
}

export async function fetchProviderResource(
  provider: IntegrationProvider,
  path: string,
): Promise<{ ok: boolean; status: number; body: unknown; error?: string }> {
  if (!isConfigured(provider)) {
    return { ok: false, status: 0, body: null, error: `${provider} is not configured` };
  }
  const baseUrl = resolveBaseUrl(provider).replace(/\/$/, "");
  const token = resolveToken(provider);
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) {
      if (provider === "github" || provider === "ado") {
        headers.authorization = `Bearer ${token}`;
      } else if (provider === "gitlab" || provider === "figma" || provider === "bitbucket") {
        headers.authorization = `Bearer ${token}`;
      } else {
        headers.authorization = `Bearer ${token}`;
      }
    }
    const response = await fetch(`${baseUrl}${path}`, { headers });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function probeProvider(provider: IntegrationProvider): Promise<{
  configured: boolean;
  status: string;
  baseUrl: string;
  metadata: Record<string, unknown>;
}> {
  const configured = isConfigured(provider);
  const baseUrl = resolveBaseUrl(provider);
  if (!configured) {
    return { configured: false, status: "unconfigured", baseUrl, metadata: {} };
  }
  const probePath = CONFIG[provider].probePath;
  if (!probePath) {
    return { configured: true, status: "configured", baseUrl, metadata: {} };
  }
  const path = provider === "oidc" ? probePath : probePath;
  const urlBase = provider === "oidc" ? process.env.SETWIN_OIDC_ISSUER ?? "" : baseUrl;
  try {
    const result = await fetchProviderResource(provider, path.startsWith("http") ? new URL(path).pathname : path);
    // special-case oidc absolute well-known
    if (provider === "oidc") {
      const response = await fetch(`${urlBase.replace(/\/$/, "")}${probePath}`);
      return {
        configured: true,
        status: response.ok ? "reachable" : `http_${response.status}`,
        baseUrl: urlBase,
        metadata: { status: response.status },
      };
    }
    return {
      configured: true,
      status: result.ok ? "reachable" : result.error ? "unreachable" : `http_${result.status}`,
      baseUrl,
      metadata: { status: result.status, error: result.error },
    };
  } catch (error) {
    return {
      configured: true,
      status: "unreachable",
      baseUrl,
      metadata: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

function isConfigured(provider: IntegrationProvider): boolean {
  return CONFIG[provider].envKeys.every((key) => Boolean(process.env[key]));
}

function resolveBaseUrl(provider: IntegrationProvider): string {
  const envMap: Partial<Record<IntegrationProvider, string | undefined>> = {
    jira: process.env.SETWIN_JIRA_BASE_URL,
    ado: process.env.SETWIN_ADO_ORG_URL,
    confluence: process.env.SETWIN_CONFLUENCE_BASE_URL,
    github: process.env.SETWIN_GITHUB_BASE_URL ?? CONFIG.github.defaultBaseUrl,
    gitlab: process.env.SETWIN_GITLAB_BASE_URL ?? CONFIG.gitlab.defaultBaseUrl,
    bitbucket: process.env.SETWIN_BITBUCKET_BASE_URL ?? CONFIG.bitbucket.defaultBaseUrl,
    figma: process.env.SETWIN_FIGMA_BASE_URL ?? CONFIG.figma.defaultBaseUrl,
    oidc: process.env.SETWIN_OIDC_ISSUER,
    saml: process.env.SETWIN_SAML_METADATA_URL,
  };
  return envMap[provider] ?? CONFIG[provider].defaultBaseUrl;
}

function resolveToken(provider: IntegrationProvider): string {
  const envMap: Partial<Record<IntegrationProvider, string | undefined>> = {
    jira: process.env.SETWIN_JIRA_TOKEN,
    ado: process.env.SETWIN_ADO_TOKEN,
    confluence: process.env.SETWIN_CONFLUENCE_TOKEN,
    github: process.env.SETWIN_GITHUB_TOKEN,
    gitlab: process.env.SETWIN_GITLAB_TOKEN,
    bitbucket: process.env.SETWIN_BITBUCKET_TOKEN,
    figma: process.env.SETWIN_FIGMA_TOKEN,
  };
  return envMap[provider] ?? "";
}
