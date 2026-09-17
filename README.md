# SETwin

**Software Engineering Twin** — a living digital twin of a software product and its engineering lifecycle.

> **Your software has a memory. SETwin is that memory.**

> **AI proposes. SETwin remembers. Roles review. Humans approve. Everything is traceable.**

SETwin is not another IDE, coding assistant, Jira, GitHub, or CI system. It owns engineering knowledge, traceability, workflow, governance, and approval. It works with the LLMs, coding agents, IDEs, and engineering systems an organization already uses.

See [PLAN.md](PLAN.md) for the full product and engineering plan.

## Current status

**TypeScript Phase 20 — Enterprise Integrations is implemented.** Phases 6–20 cover audit, AI gateway, requirements, repository/change/context intelligence, AI scrum + coding agents, MCP, testing, CI/CD, OpenSecant, OpenVector, Web UI, and enterprise connectors. Python remains prototype-only; do not add Phase 21+ on the Python stack.

- CLI: `status`, `init`, `serve`, identity, twin, gherkin, workflow, review, `audit`, `requirement`, `ai`, `repo`, `change`, `context`, `agent`, `test`, `cicd`, `opensecant`, `metrics`, `integration`
- Fastify API routes for the same domain services
- MCP stdio server (`pnpm mcp`) sharing domain services
- Web UI (`pnpm web`) — Dashboard, Twin Explorer, Reviews, Approvals, Audit, AI activity
- Hash-chained audit events on mutations
- AI gateway (Ollama-first; OpenAI/Anthropic/Bedrock/Azure/Gemini adapters)
- GitHub Actions workflow plus GitLab/Jenkins/ADO templates
- PostgreSQL via Docker Compose (`pgvector/pgvector:pg16`)

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io/)
- Docker (optional, for PostgreSQL)

## Quick start

Full walkthrough: **[Getting started](docs/getting-started.md)** (install → users → requirement → review → approve → audit → API/Web/MCP).

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
pnpm setwin -- requirement create "Customers can cancel an unpaid order within 30 minutes." --project demo
pnpm setwin -- requirement gherkin REQ-001
pnpm setwin -- audit list
pnpm dev
pnpm web
```

If PostgreSQL is not running, `status` still works and reports the database as unreachable without printing secrets. Artifact versions remain immutable; AI Gherkin is always DRAFT and never auto-approved.

No cloud account is required for core local development. Optional AI and integration providers are configured via `SETWIN_*` env vars and degrade gracefully when unset.

## Configuration

Settings are loaded from environment variables prefixed with `SETWIN_`. Copy `.env.example` to `.env`. Status output redacts database passwords. SQLAlchemy-style URLs (`postgresql+psycopg://`) are accepted and normalized.

## Documentation

- [Getting started (step by step)](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Third-party notices](THIRD_PARTY.md)
- [Plan](PLAN.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
