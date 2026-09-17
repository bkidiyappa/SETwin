# SETwin

**Software Engineering Twin** — a living digital twin of a software product and its engineering lifecycle.

> **Your software has a memory. SETwin is that memory.**

> **AI proposes. SETwin remembers. Roles review. Humans approve. Everything is traceable.**

SETwin is not another IDE, coding assistant, Jira, GitHub, or CI system. It owns engineering knowledge, traceability, workflow, governance, and approval. It works with the LLMs, coding agents, IDEs, and engineering systems an organization already uses.

See [PLAN.md](PLAN.md) for the full product and engineering plan.

## Current status

**TypeScript Phase 5 — Review & Approval is implemented.** Python 3.12+ remains only as a prototype and for later ML/analytics. Do not add Phase 6+ on the Python stack.

- CLI: `status`, `init`, `serve`, `login`, `whoami`, `user`, `role`, `team`, `project`, `artifact`, `relate`, `gherkin`, `workflow`, `review`
- Configuration from `SETWIN_*` environment variables
- Pino structured logging with correlation IDs
- Fastify health, status, identity, twin, Gherkin, workflow, and review
- PostgreSQL via Docker Compose
- Workflow states on artifact versions plus `workflow_policies` and `workflow_transitions`
- Reviews, findings, `approval_policies`, `approval_requests`, and `approval_decisions`
- Immutable versions; Gherkin validation; gated `submit` / `approve` / `reject` / `request_changes`
- Multi-approval, sequential approval, delegation, escalation, and author separation of duties
- scrypt passwords, SHA-256 session tokens (`stw_…`), backend permission checks
- Vitest

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io/)
- Docker (optional, for PostgreSQL)

## Quick start

```bash
pnpm install
copy .env.example .env
docker compose up -d
pnpm test
pnpm setwin -- init
pnpm setwin -- status
pnpm setwin -- user create admin --password admin-pass
pnpm setwin -- login admin --password admin-pass
pnpm setwin -- whoami
pnpm setwin -- project create demo --name "Demo"
pnpm setwin -- artifact create --project demo --type REQUIREMENT --title "Cancel an order" --content "Customers can cancel an order within 30 minutes."
pnpm setwin -- artifact version REQ-001 --content "Customers can cancel an unpaid order within 30 minutes."
pnpm setwin -- gherkin create --project demo --file order-cancel.feature --requirement REQ-001
pnpm setwin -- gherkin show GHK-001
pnpm setwin -- workflow submit REQ-001
pnpm setwin -- review show REQ-001
pnpm setwin -- review finding REQ-001 --severity INFO --summary "Acceptance criteria look complete."
pnpm setwin -- review approve REQ-001
pnpm dev
```

If PostgreSQL is not running, `status` still works and reports the database as unreachable without printing secrets. `init` creates local `data/` and `workspace/` directories, applies migrations when the database is reachable, and seeds default roles, permissions, workflow policies, and approval policies. The first user created becomes `administrator`. Later user creation requires `admin:manage_users` and a session from `setwin login` or `SETWIN_TOKEN`. Artifact v1 is `DRAFT`; a new version leaves the previous DRAFT as `SUPERSEDED` and does not rewrite it in place. Gherkin is parsed with `@cucumber/gherkin` before it is stored. Workflow requires `submit` before `approve`; `IN_REVIEW` versions cannot be replaced in place. Submit opens a review and required approval requests; all required decisions must complete before the version becomes `APPROVED`.

No cloud account is required for core local development.

## Configuration

Settings are loaded from environment variables prefixed with `SETWIN_`. Copy `.env.example` to `.env`. Status output redacts database passwords. SQLAlchemy-style URLs (`postgresql+psycopg://`) are accepted and normalized.

## Documentation

- [Architecture](docs/architecture.md)
- [Third-party notices](THIRD_PARTY.md)
- [Plan](PLAN.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
