# SETwin

**Software Engineering Twin** — a living digital twin of a software product and its engineering lifecycle.

> **Your software has a memory. SETwin is that memory.**

> **AI proposes. SETwin remembers. Roles review. Humans approve. Everything is traceable.**

SETwin is not another IDE, coding assistant, Jira, GitHub, or CI system. It owns engineering knowledge, traceability, workflow, governance, and approval. It works with the LLMs, coding agents, IDEs, and engineering systems an organization already uses.

![Dashboard for a product in progress](docs/images/dashboard.png)

See [PLAN.md](PLAN.md) for the full product and engineering plan.

## Current status

**TypeScript Phase 20 — Enterprise Integrations is implemented.** Phases 6–20 cover audit, AI gateway, requirements, repository/change/context intelligence, AI scrum + coding agents, MCP, testing, CI/CD, OpenSecant, OpenVector, Web UI, and enterprise connectors. Python remains prototype-only; do not add Phase 21+ on the Python stack.

- CLI: `status`, `init`, `serve`, identity, twin, gherkin, workflow, review, `audit`, `requirement`, `ai`, `repo`, `change`, `context`, `agent`, `test`, `cicd`, `opensecant`, `metrics`, `integration`
- Fastify API routes for the same domain services
- MCP stdio server (`pnpm mcp`) sharing domain services
- Web UI (`pnpm web`) — sign in, then Dashboard, Workspace, Twin Explorer, Test Plans, Reviews, Audit, AI activity, and Setup
- Hash-chained audit events on mutations
- AI gateway (Ollama-first; OpenAI/Anthropic/Bedrock/Azure/Gemini adapters)
- GitHub Actions workflow plus GitLab/Jenkins/ADO templates
- PostgreSQL. `docker compose up -d` starts a sample server. A Postgres you already run is enough when `SETWIN_DATABASE_URL` points at it.

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io/)
- PostgreSQL that is already running and reachable. Docker is one way to start it (`docker compose up -d` in this repo). The app does not require the pgvector extension.

## Quick start

Full walkthrough: **[Getting started](docs/getting-started.md)**. How pipeline, Explorer, and approvals fit together: **[Architecture](docs/architecture.md)**. A single-host install with backups and TLS: **[Production](docs/production.md)**.

```bash
pnpm install
```

Create `.env` from the example. On Windows: `copy .env.example .env`. On macOS or Linux: `cp .env.example .env`.

`SETWIN_DATABASE_URL` must name a database that already exists on a running Postgres. `init` creates the tables there. It does not install Postgres, start it, or create the database.

On Linux, `copy .env.example .env` is not a command. Use `cp`. If `.env` was never created, `init` uses the default URL `127.0.0.1:5432/setwin`.

To use the sample server instead of your own Postgres:

```bash
docker compose up -d
docker compose ps
```

Wait until the postgres service is healthy. `docker compose up -d` returns before Postgres accepts connections.

```bash
pnpm setwin -- init
pnpm setwin -- user create admin --password admin-pass
```

If init fails, pnpm prints only this:

```text
ELIFECYCLE  Command failed with exit code 1.
```

That line is pnpm reporting the exit status. The SETwin lines above it name `SETWIN_DATABASE_URL` and the check result: nothing listening, the database name is missing, or the password was rejected. The same cases are written out in [Getting started](docs/getting-started.md#if-init-prints-command-failed-with-exit-code-1). `pnpm setwin -- status` repeats the check.

Then, in two terminals: `pnpm dev` and `pnpm web`. Open [http://127.0.0.1:5173](http://127.0.0.1:5173), sign in, and follow **Setup** in [Getting started](docs/getting-started.md).

**Start over** deletes products and users, not your git checkouts. With the sample server: `docker compose down -v`, then `up -d`, `init`, and `user create` again. With your own Postgres: drop and recreate that database, then `init` and `user create` again. Sign out and log in.

## Configuration

Settings are loaded from environment variables prefixed with `SETWIN_`. Copy `.env.example` to `.env`. `SETWIN_DATABASE_URL` is the Postgres SE Twin uses. Status output redacts database passwords. SQLAlchemy-style URLs (`postgresql+psycopg://`) are accepted and normalized.

## Documentation

- [Getting started (step by step)](docs/getting-started.md)
- [Production install](docs/production.md)
- [Architecture](docs/architecture.md)
- [Third-party notices](THIRD_PARTY.md)
- [Plan](PLAN.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
