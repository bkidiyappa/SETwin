# Getting started with SETwin

Step-by-step guide for local use on the TypeScript core. Commands below assume you run them from the repository root on Windows PowerShell. On macOS/Linux, use `cp` instead of `copy`.

> **AI proposes. SETwin remembers. Roles review. Humans approve. Everything is traceable.**

For system layout, see [architecture.md](architecture.md). For the full product plan, see [PLAN.md](../PLAN.md).

---

## 1. Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/)
- Docker Desktop (recommended) for PostgreSQL

Optional later:

- [Ollama](https://ollama.com/) for local AI (Phase 7+)
- Provider API keys in `.env` for OpenAI, Anthropic, etc.

**CLI tip:** there is no global `setwin` binary after clone. Always use:

```bash
pnpm setwin -- status
pnpm setwin -- init
```

The `--` after `setwin` stops pnpm from swallowing flags meant for the CLI.

---

## 2. Install and configure

```bash
pnpm install
copy .env.example .env
docker compose up -d
pnpm test
```

Check what `.env` controls in [`.env.example`](../.env.example). Secrets stay out of Git. Status output redacts database passwords.

Confirm the stack:

```bash
pnpm setwin -- status
```

You should see a redacted database URL and whether Postgres is reachable.

---

## 3. Initialize the workspace

```bash
pnpm setwin -- init
```

This creates `data/` and `workspace/`, applies migrations when the database is up, and seeds:

- roles and permissions
- workflow policies
- approval policies

Re-running `init` is safe if already initialized.

---

## 4. Create users and log in

The **first** user becomes `administrator`. Later users need an admin session.

```bash
pnpm setwin -- user create admin --password admin-pass
pnpm setwin -- login admin --password admin-pass
pnpm setwin -- whoami
```

Login stores a session token in `data/session.json` (gitignored). You can also pass `--token` or set `SETWIN_TOKEN`.

**If `user create` says Authentication required:** the database already has users (often from `pnpm test`). Reset and bootstrap:

```bash
docker compose down -v
docker compose up -d
pnpm setwin -- init
pnpm setwin -- user create admin --password admin-pass
pnpm setwin -- login admin --password admin-pass
```

### Web UI sign-in

1. Open `http://localhost:5173` (Dashboard) with API (`pnpm dev`) and Web (`pnpm web`) running.
2. Enter username/password → **Log in** (or paste `stw_…` from `data/session.json` under Advanced).
3. Open Twin Explorer — the `Authentication required` error should be gone.

`/status` is public, so Database can show **up** before you sign in. Artifact pages need a Bearer token.

Create a Product Owner for requirement approval (separation of duties: authors should not approve their own work):

```bash
pnpm setwin -- user create po --password po-pass --role product_owner
pnpm setwin -- user create reviewer --password reviewer-pass --role product_owner
pnpm setwin -- role list
```

Useful identity commands:

```bash
pnpm setwin -- user list
pnpm setwin -- user show po
pnpm setwin -- user assign-role reviewer product_owner
pnpm setwin -- team create platform --description "Core team"
pnpm setwin -- team add platform po
```

---

## 5. First vertical slice (demo)

Demo scenario from the plan:

> Customers can cancel an order within 30 minutes.

### 5.1 Project

```bash
pnpm setwin -- project create demo --name "Demo"
pnpm setwin -- project show demo
```

### 5.2 Requirement (DRAFT)

```bash
pnpm setwin -- requirement create "Customers can cancel an unpaid order within 30 minutes." --project demo
pnpm setwin -- requirement show REQ-001
```

Artifact keys are typed (`REQ-001`, `GHK-001`, …). Version 1 starts as `DRAFT`.

### 5.3 Generate Gherkin (always DRAFT)

With Ollama (or another configured provider):

```bash
pnpm setwin -- requirement gherkin REQ-001
pnpm setwin -- gherkin show GHK-001
```

AI output is validated and stored as **DRAFT**. It is never auto-approved.

Without a live model, the gateway may fall back to a deterministic draft or report the provider unavailable—check `pnpm setwin -- ai actions`.

You can also author Gherkin by hand:

```bash
pnpm setwin -- gherkin validate --file order-cancel.feature
pnpm setwin -- gherkin create --project demo --file order-cancel.feature --requirement REQ-001
```

### 5.4 Submit for review

Still logged in as `admin` (or the author):

```bash
pnpm setwin -- workflow submit REQ-001
pnpm setwin -- workflow show REQ-001
pnpm setwin -- review show REQ-001
```

Submit moves the version to `IN_REVIEW` and opens approval requests from `approval_policies`. You cannot create a new version while `IN_REVIEW`.

### 5.5 Review findings and approve

Log in as a Product Owner who did **not** author the requirement:

```bash
pnpm setwin -- login reviewer --password reviewer-pass
pnpm setwin -- review finding REQ-001 --severity INFO --summary "Acceptance criteria look complete."
pnpm setwin -- review approve REQ-001 --comment "Looks good"
pnpm setwin -- workflow show REQ-001
```

Notes:

- Unresolved **HIGH** findings block approval.
- Requirement approval expects the `product_owner` role (administrator may bypass the role gate).
- Authors cannot approve their own artifact unless they are administrator.
- `workflow approve` and `review approve` both record decisions through the shared review/approval services.

Reject or request changes:

```bash
pnpm setwin -- review reject REQ-001 --comment "Missing unpaid constraint"
pnpm setwin -- review request-changes REQ-001 --comment "Clarify time window"
```

### 5.6 Audit trail

```bash
pnpm setwin -- login admin --password admin-pass
pnpm setwin -- audit list
pnpm setwin -- audit verify
```

Every important mutation appends a hash-chained audit event.

---

## 6. Day-to-day artifact workflow

### Create and version

```bash
pnpm setwin -- artifact create --project demo --type DESIGN --title "Cancel flow" --content "Service + API"
pnpm setwin -- artifact show DES-001
pnpm setwin -- artifact version DES-001 --content "Updated design"
pnpm setwin -- artifact list --project demo
```

Approved versions are never rewritten in place. A new version is always a fresh `DRAFT`.

### Relationships

```bash
pnpm setwin -- relate GHK-001 VALIDATES REQ-001
pnpm setwin -- artifact relations REQ-001
```

### Policies

```bash
pnpm setwin -- workflow policies
pnpm setwin -- review policies
```

Examples:

| Artifact type | Approvers (default) |
|---|---|
| REQUIREMENT / GHERKIN | `product_owner` |
| DESIGN | `architect` |
| CODE | `engineering_manager` + `security_reviewer` (parallel) |
| ARCHITECTURE | `architect` then `engineering_manager` (sequential) |
| TEST | `qa_reviewer` |

### Delegation and escalation

```bash
pnpm setwin -- review delegate REQ-001 --to reviewer --role product_owner
pnpm setwin -- review escalate REQ-001 --to-role engineering_manager --to em
```

---

## 7. Run the API and Web UI

These are **two different processes**. Keep `pnpm dev` running, then open a **second** terminal in the same repo for the Web UI.

| URL | What it is | How to start |
|---|---|---|
| `http://127.0.0.1:8000/health` | Fastify API | `pnpm dev` |
| `http://127.0.0.1:5173` | Vite Web UI | `pnpm web` (second terminal) |

Terminal 1 — API (default `127.0.0.1:8000`):

```bash
pnpm dev
```

Or:

```bash
pnpm setwin -- serve
```

Leave that running. Health check in a browser: `http://127.0.0.1:8000/health` → `{"status":"ok","name":"SETwin","version":"0.1.0"}`.

Terminal 2 — Web UI (Vite on `http://127.0.0.1:5173`, proxies `/api` to the API):

```bash
pnpm web
```

Then open `http://127.0.0.1:5173`. If you see **ERR_CONNECTION_REFUSED** on `:5173`, the Web UI is not running yet — only the API is.

If `pnpm web` fails on `esbuild` (pnpm blocked build scripts), edit `pnpm-workspace.yaml` so Vite can build:

```yaml
packages:
  - "apps/*"
  - "packages/*"
allowBuilds:
  esbuild: true
```

Then reinstall and start the UI:

```bash
pnpm install
pnpm web
```

(`pnpm approve-builds` only lists packages still waiting; if you previously selected none, `esbuild` is already recorded as denied and will not appear again.)

In the UI: use **Dashboard → Log in** with username/password (or paste a CLI token under Advanced). Then open Twin Explorer, Reviews, Approvals, Audit, and AI activity.

---

## 8. AI gateway (optional)

Configure providers in `.env` (see `.env.example`). Ollama-first:

```bash
# SETWIN_OLLAMA_BASE_URL=http://127.0.0.1:11434
# SETWIN_OLLAMA_MODEL=qwen2.5:7b
```

```bash
pnpm setwin -- ai complete --prompt "Summarize cancel-order acceptance criteria"
pnpm setwin -- ai actions
```

All model calls go through the gateway. Unconfigured providers fail gracefully.

---

## 9. MCP server (optional)

```bash
pnpm mcp
```

MCP speaks JSON-RPC over stdio and uses the same domain services as CLI/API (no direct database access). Point your MCP client at this process when integrating IDEs or agents.

---

## 10. Later capabilities (short reference)

These are available after the core slice works. Use `--help` on each command for flags.

| Area | Commands |
|---|---|
| Repository | `repo register`, `repo index`, `repo list`, `repo symbols` |
| Change | `change analyze`, `change list` (see `pnpm setwin -- change --help`) |
| Context | `context ingest`, `context search` |
| AI scrum / coding agents | `agent propose`, `agent proposals`, `agent coding` |
| Testing | `test ingest`, `test list` |
| CI/CD | `cicd adapters`, `cicd render` |
| OpenSecant | `opensecant generate`, `opensecant execute` |
| OpenVector metrics | `metrics record`, `metrics series`, `metrics events` |
| Integrations | `integration list`, `integration sync` |

Templates also live under `templates/` and `.github/workflows/` for GitHub Actions / GitLab / Jenkins / Azure DevOps.

---

## 11. Common failures

| Symptom | What to check |
|---|---|
| `status` shows database unreachable | `docker compose up -d`; port `5432`; `SETWIN_DATABASE_URL` in `.env` |
| Login required | `pnpm setwin -- login …` or `--token` / `SETWIN_TOKEN` |
| Cannot approve from DRAFT | `workflow submit` first |
| Cannot create version while IN_REVIEW | Approve, reject, or request changes first |
| Approval blocked | Role/permission mismatch; author separation of duties; unresolved HIGH finding; expired `--due` |
| AI Gherkin failed | Ollama/provider env; `ai actions`; still never auto-approves |
| Web UI empty / 401 | API running on `:8000`; **Log in** on Dashboard (stale browser tokens after DB reset break login — use Sign out, then Log in again) |
| `:5173` connection refused | Second terminal: `pnpm web` (API alone is only `:8000`) |
| `setwin` not recognized | Use `pnpm setwin -- …`, not a bare `setwin` |
| `pnpm web` / esbuild error | In `pnpm-workspace.yaml` set `allowBuilds.esbuild: true`, then `pnpm install` and `pnpm web` |

Get help for any command:

```bash
pnpm setwin -- --help
pnpm setwin -- review --help
pnpm setwin -- requirement --help
```

---

## 12. What not to do

- Do not extend the Python prototype under `setwin/` with new product phases.
- Do not treat AI drafts as approved.
- Do not rewrite an `APPROVED` version in place—create the next `DRAFT`.
- Do not commit `.env`, `data/session.json`, or real secrets.
