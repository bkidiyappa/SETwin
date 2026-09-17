# Architecture

SETwin is a **modular monolith**. CLI, API, and later MCP share application services. MCP must not talk to the database directly.

```text
CLI  ----+
API  ----+----> @setwin/auth / @setwin/twin / @setwin/core ----> PostgreSQL
MCP  ----+
```

## Phase 0–5 (TypeScript)

| Area | Implementation |
|---|---|
| Workspace | pnpm (`apps/*`, `packages/*`) |
| Configuration | `@setwin/config` with Zod and `SETWIN_*` env vars |
| Logging | Pino JSON on stderr, `correlation_id` via AsyncLocalStorage |
| Status / init | `@setwin/core`; init seeds identity catalog, workflow policies, and approval policies |
| Identity | `@setwin/auth` (users, roles, permissions, teams, sessions) |
| Twin core | `@setwin/twin` (projects, artifacts, versions, relationships, Gherkin, workflow, reviews) |
| Gherkin | `@cucumber/gherkin` parse/validate; Feature/Scenario/Step rows per version |
| Workflow | Lifecycle graph, gates, and type policies in `@setwin/twin` |
| Review | Reviews, findings, approval requests/decisions, multi-approval, delegation, escalation |
| HTTP | Fastify in `@setwin/api` including `/artifacts/:key/workflow` and `/artifacts/:key/review` |
| CLI | Commander including `workflow` and `review show|finding|approve|reject|request-changes|delegate|escalate|policies` |
| Database | Drizzle ORM + `postgres` against PostgreSQL 16 |
| Local process | `docker-compose.yml` (Postgres only) |

Audit history and AI belong to later phases.

## Layout

```text
apps/cli          setwin CLI
apps/api          Fastify HTTP API
packages/config   settings, logging, URL redaction
packages/database Drizzle schema, health, migrations
packages/auth     identity, passwords, sessions, permission checks
packages/twin     projects, artifacts, Gherkin, workflow, reviews
packages/core     status and init services
```

A Python Phase 0 prototype remains under `setwin/` from an earlier plan revision. Do not extend it.

## Data layer

- PostgreSQL for transactional state
- Identity, twin, Gherkin, workflow, review, and approval tables
- Version lineage (`DRAFT` / `SUPERSEDED` / `APPROVED`) is separate from workflow state
- Lifecycle: `DRAFT` → `IN_REVIEW` → `APPROVED` | `REJECTED` | `CHANGES_REQUESTED`
- Approve from `DRAFT` is rejected. New versions are blocked while `IN_REVIEW`.
- Submit creates a Review plus ApprovalRequest rows from `approval_policies`
- CODE is parallel (`engineering_manager` + `security_reviewer`); ARCHITECTURE is sequential (`architect` then `engineering_manager`)
- The artifact author cannot approve unless administrator; unresolved HIGH findings block approval
- Administrator may satisfy remaining approval requests in one action

## Security

- Secrets stay in environment variables, never in Git
- Status output redacts database passwords
- Passwords hashed with scrypt; session tokens are `stw_…` values stored as SHA-256 hashes
- CLI session stored in `data/session.json` or `SETWIN_TOKEN`
- Workflow transitions check current state, permission, approval policy, and the open approval request
- Gherkin validation is syntactic only; step text is never executed

## Next phase

Phase 6 — Audit: audit events, immutable history, AI activity, provenance.
