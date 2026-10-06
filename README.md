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
- PostgreSQL. Install it with the operating system, or start the sample server with Docker on a machine that has no PostgreSQL. The app does not require the pgvector extension.

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io/)
- PostgreSQL already running on the machine

## Quick start

Full walkthrough: **[Getting started](docs/getting-started.md)**. How pipeline, Explorer, and approvals fit together: **[Architecture](docs/architecture.md)**. A single-host install with backups and TLS: **[Production](docs/production.md)**.

These commands are for PostgreSQL installed on Linux. Do not run `docker compose` when that service is already running.

```bash
pnpm install
cp .env.example .env
sudo systemctl start postgresql
sudo -u postgres psql -c "CREATE USER setwin WITH PASSWORD 'setwin';"
sudo -u postgres psql -c "CREATE DATABASE setwin OWNER setwin;"
psql "postgresql://setwin:setwin@127.0.0.1:5432/setwin" -c "SELECT 1"
pnpm setwin -- init
pnpm setwin -- user create admin --password admin-pass
```

`copy .env.example .env` is the Windows command. On Linux it fails, `.env` is missing, and init uses the default URL anyway.

`SETWIN_DATABASE_URL` and the `psql` argument are the same string: `postgresql://setwin:setwin@127.0.0.1:5432/setwin`. A value that starts with `postgresql+psycopg://` is a different string. `psql` rejects `+psycopg`. Change `.env` to the `postgresql://` form before `init`.

A Linux PostgreSQL package creates the `postgres` superuser and the `postgres` database. It does not create user `setwin` or database `setwin`. The URL in `.env.example` expects both, and `init` only creates tables inside that database. The `psql` line must succeed before `init`. SE Twin connects to `127.0.0.1` with a password, so `pg_hba.conf` needs a `host` line for `127.0.0.1/32` using `scram-sha-256` or `md5`.

Docker is a different install, for a machine with no PostgreSQL. It is in [Getting started](docs/getting-started.md#no-postgresql-on-the-machine). Two servers cannot share port 5432.

If init fails, pnpm prints only this:

```text
ELIFECYCLE  Command failed with exit code 1.
```

That line is pnpm reporting the exit status. The SETwin lines above it name `SETWIN_DATABASE_URL` and the check result: nothing listening, the database name is missing, or the password was rejected. The same cases are written out in [Getting started](docs/getting-started.md#if-init-prints-command-failed-with-exit-code-1). `pnpm setwin -- status` repeats the check.

Then, in two terminals: `pnpm dev` and `pnpm web`. Open [http://127.0.0.1:5173](http://127.0.0.1:5173), sign in, and follow **Setup** in [Getting started](docs/getting-started.md).

**Start over** on Linux deletes products and users, not your git checkouts:

```bash
sudo -u postgres psql -c "DROP DATABASE setwin;"
sudo -u postgres psql -c "CREATE DATABASE setwin OWNER setwin;"
pnpm setwin -- init
pnpm setwin -- user create admin --password admin-pass
```

Sign out and log in.

## Configuration

Settings are loaded from environment variables prefixed with `SETWIN_`. Copy `.env.example` to `.env`. `SETWIN_DATABASE_URL` is the Postgres URL, and it must start with `postgresql://` so `psql` and `init` use the same string. Status output redacts database passwords. An older `postgresql+psycopg://` value is still rewritten to `postgresql://` before connecting. Change it in `.env` so the file matches the `psql` check.

## Documentation

- [Getting started (step by step)](docs/getting-started.md)
- [Production install](docs/production.md)
- [Architecture](docs/architecture.md)
- [Third-party notices](THIRD_PARTY.md)
- [Plan](PLAN.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
