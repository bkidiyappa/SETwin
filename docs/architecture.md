# Architecture

SETwin is a **modular monolith**. CLI, API, MCP, and Web UI share the same domain packages and PostgreSQL database. MCP never talks to the database directly.

```text
CLI / API / MCP / Web  --->  packages/* (domain)  --->  PostgreSQL (+ pgvector-ready)
```

> **AI proposes. SETwin remembers. Roles review. Humans approve. Everything is traceable.**

---

## How the product works (end-to-end)

### 1. Bootstrap

1. `docker compose up -d` starts Postgres.
2. `pnpm setwin -- init` creates `data/` + `workspace/`, applies migrations, and seeds:
   - roles & permissions (`@setwin/auth`)
   - workflow policies (`submit` / `approve` / `reject` / `request_changes`)
   - approval policies per artifact type (who must approve)
3. First user becomes `administrator`. Later users are assigned roles (e.g. `product_owner`, `architect`, `developer`, `qa_reviewer`).

### 2. Product & repository

1. Create a **project** (product) — CLI `project create` or Web **Repositories**.
2. Optionally **register a git repo** under that project and index symbols for context.

Artifacts always belong to a project. Twin Explorer’s top filter is the **product (project)**.

### 3. Stories from a prompt (Workspace)

1. Sign in (Dashboard). Session carries `roles` + `permissions`.
2. On **Workspace**, enter a free-text prompt (placeholder only; field starts empty).
3. **Create stories** calls `POST /stories/from-prompt`.
   - Product Owner skill (`packages/agents/skills/product_owner.md`) asks the AI to split the prompt into one or more logical **STORY** drafts (`STY-*`).
   - Each story is editable (title/body). **Save** writes a new DRAFT version.
4. **Submit for review** → workflow `DRAFT → IN_REVIEW` and opens approval requests (PO for stories).
5. **Accept / Reject / Request changes** (Workspace, Reviews, or Approvals pages).
   - Reject with a reason → **Agent revise** (PO skill) creates a new DRAFT addressing the reason; optional auto-resubmit.

**Gate:** nothing advances to Design until at least one story is **APPROVED**.

### 4. Gated SDLC pipeline

Defined in `packages/agents/src/pipeline.ts` (`SDLC_STAGES`):

| Stage | Artifact types | Requires prior APPROVED | Typical create roles | Typical approve roles |
|---|---|---|---|---|
| Story | STORY, REQUIREMENT, FEATURE, EPIC | — | product_owner | product_owner |
| Design | DESIGN, ARCHITECTURE | Story | architect | architect, engineering_manager |
| Code | CODE | Design | developer | engineering_manager, security_reviewer |
| Test | TEST, GHERKIN | Code | qa_reviewer | qa_reviewer |

**Advance** (`POST /pipeline/advance`):

- Fails if the prior stage has no APPROVED artifacts.
- Checks the actor’s role/permissions for that stage.
- **Reuses** existing linked artifacts when possible; otherwise creates a DRAFT via the role skill.
- Establishes **many-to-many** relationships, e.g.:
  - Design/Architecture `DESIGNED_BY` → Story
  - Code `IMPLEMENTS` → Story (and prior design)
  - Test `TESTED_BY` → Story / Code

Humans still **Submit → Approve** each new draft. Without approval, the next stage stays blocked.

### 5. Twin Explorer (traceability UI)

Layout:

1. **Product** dropdown (top).
2. **Node graph** — all artifacts for that product as a force-directed network.
   - Colors: Requirements (red) · Design/Code (yellow) · Tests (teal) · Other (blue).
   - Node size reflects connection count.
   - **Zoom in** (`+`, scroll up) reveals titles, then type/state. **Zoom out** shows a compact map.
   - Drag to pan. **Expand ↗** opens the graph in a modal; **Collapse** returns to the pane (selection/zoom kept).
3. Three searchable cards: **Requirements · Code/Design · Tests**.
   - With **no selection**: each card lists all artifacts of that family for the product.
   - **Click a node** (or a card row): cards refresh to only **connected** artifacts (transitive closure over relationship edges). Banner shows counts.
   - Card **Expand ↗** opens a modal for search/select; **Collapse** applies state back to the pane.

APIs used: `GET /pipeline/:project` (artifacts + relationships), `GET /context/graph/:key`, `POST /pipeline/link`, lifecycle submit/decide.

### 6. Reviews & Approvals

- **Reviews** / **Approvals** list open work and support Accept / Reject / Request changes (role + `artifact:approve` required).
- Separation of duties: authors generally cannot approve their own artifacts.

### 7. Skills as guardrails

Role guidelines live as markdown under `packages/agents/skills/*.md` (plus `_shared.md`).  
`buildRoleSystemPrompt(role, taskId)` injects them into AI calls so agents propose DRAFTs only and never self-approve.

```bash
pnpm setwin -- agent skills
pnpm setwin -- agent skills product_owner
```

---

## Phase 0–20 (TypeScript packages)

| Area | Implementation |
|---|---|
| Workspace / monorepo | pnpm (`apps/*`, `packages/*`) |
| Configuration | `@setwin/config` Zod + `SETWIN_*` |
| Logging | Pino JSON, `correlation_id` |
| Status / init | `@setwin/core` |
| Identity | `@setwin/auth` |
| Twin / Gherkin / Workflow / Review | `@setwin/twin` |
| Audit | `@setwin/audit` hash-chained events |
| AI gateway | `@setwin/ai` (Ollama-first + cloud providers) |
| Stories / requirements | `@setwin/requirements` |
| Repo / Change / Context | `@setwin/repo`, `@setwin/change`, `@setwin/context` |
| Agents / pipeline / skills | `@setwin/agents` |
| Testing / OpenSecant | `@setwin/testing`, `@setwin/opensecant` |
| CI/CD | `@setwin/cicd` |
| OpenVector | `@setwin/openvector` |
| Integrations | `@setwin/integrations` |
| HTTP / CLI / MCP / Web | `apps/api`, `apps/cli`, `apps/mcp`, `apps/web` |
| Database | Drizzle + `pgvector/pgvector:pg16` |

## Layout

```text
apps/cli          setwin CLI
apps/api          Fastify HTTP API
apps/mcp          MCP server (domain services only)
apps/web          Vite/React UI
packages/*        shared domain services
packages/agents/skills/*.md   role AI guardrails
templates/*       pipeline templates
```

## Reset to a clean slate

To wipe all twin data and start from defining a product/repo again:

```bash
docker compose down -v
docker compose up -d
pnpm setwin -- init
pnpm setwin -- user create admin --password admin-pass
pnpm setwin -- login admin --password admin-pass
```

Then Sign out / Log in on the Web Dashboard (old browser tokens are invalid after a DB wipe).

## Documentation

- [Getting started (step by step)](getting-started.md)
- [Plan](../PLAN.md)
- [Third-party notices](../THIRD_PARTY.md)

## Next phase

Phase 21 — Observability (OpenTelemetry, Datadog, Prometheus, Grafana, CloudWatch, Application Insights).
