# Architecture

SETwin is a **modular monolith**. CLI, API, MCP, and Web UI share application services. MCP must not talk to the database directly.

```text
CLI / API / MCP / Web ----> domain packages ----> PostgreSQL (+ pgvector-ready)
```

## Phase 0–20 (TypeScript)

| Area | Implementation |
|---|---|
| Workspace | pnpm (`apps/*`, `packages/*`) |
| Configuration | `@setwin/config` with Zod and `SETWIN_*` env vars |
| Logging | Pino JSON on stderr, `correlation_id` via AsyncLocalStorage |
| Status / init | `@setwin/core`; seeds identity, workflow, approval policies |
| Identity | `@setwin/auth` |
| Twin / Gherkin / Workflow / Review | `@setwin/twin` |
| Audit | `@setwin/audit` append-only hash-chained events |
| AI gateway | `@setwin/ai` Ollama-first + OpenAI/Anthropic/Bedrock/Azure/Gemini |
| Requirements | `@setwin/requirements` create/show + AI Gherkin drafts |
| Repo / Change / Context | `@setwin/repo`, `@setwin/change`, `@setwin/context` |
| Agents | `@setwin/agents` scrum roles + coding agent adapters |
| Testing / OpenSecant | `@setwin/testing`, `@setwin/opensecant` |
| CI/CD | `@setwin/cicd` + `.github/workflows` + templates |
| OpenVector | `@setwin/openvector` events/metrics/series |
| Integrations | `@setwin/integrations` Jira/ADO/Confluence/GitHub/GitLab/Bitbucket/Figma/OIDC/SAML |
| MCP | `apps/mcp` JSON-RPC stdio tools/resources/prompts |
| Web UI | `apps/web` Vite/React Dashboard, Twin Explorer, Reviews, Approvals, Audit, AI activity |
| HTTP | Fastify in `apps/api` |
| CLI | Commander in `apps/cli` |
| Database | Drizzle + `postgres`; Docker Compose uses `pgvector/pgvector:pg16` |

## Layout

```text
apps/cli          setwin CLI
apps/api          Fastify HTTP API
apps/mcp          MCP server (domain services only)
apps/web          Vite/React UI
packages/*        shared domain services
templates/*       GitLab/Jenkins/ADO pipeline templates
```

A Python Phase 0 prototype remains under `setwin/`. Do not extend it with Phase 1+.

## Documentation

- [Getting started (step by step)](getting-started.md)
- [Plan](../PLAN.md)
- [Third-party notices](../THIRD_PARTY.md)

## Next phase

Phase 21 — Observability (OpenTelemetry, Datadog, Prometheus, Grafana, CloudWatch, Application Insights).
