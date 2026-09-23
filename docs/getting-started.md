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

On the Web UI: **Sign out**, then **Log in** again (tokens from the old DB are invalid).

### Full data wipe (start from product + repo)

To delete all projects, stories, reviews, and repos and begin fresh:

```bash
docker compose down -v
docker compose up -d
pnpm setwin -- init
pnpm setwin -- user create admin --password admin-pass
pnpm setwin -- login admin --password admin-pass
```

Then create a project/feature on **Setup** (or CLI), optionally register a repo, and use Workspace → Approve → Advance → Twin Explorer.

### Web UI sign-in

1. Open `http://localhost:5173` (Dashboard) with API (`pnpm dev`) and Web (`pnpm web`) running.
2. Enter username/password → **Log in** (or paste `stw_…` from `data/session.json` under Advanced).
3. Open **Workspace** (`/workspace`) for the gated workflow:
   - Prompt on top; four columns: Stories · Design · Code · Tests (drag column edges to resize).
   - Create Features on **Setup**; attach a Feature to each story before submit (no default).
   - Story-level **→ Design / → Code / → Tests**; LLM context includes the full Feature + all sibling stories.
   - Activity opens from the header clock icon (modal).
   - Left nav is collapsible with icons.
4. **Twin Explorer** (`/twin`): product filter, full node graph (zoom in for titles/details, Expand/Collapse modal), and three searchable cards (Requirements / Code / Tests). Click a node to refresh all cards with connected artifacts only.
   - Role skills are markdown under `packages/agents/skills/*.md`. List with `pnpm setwin -- agent skills`.
4. Twin Explorer / Repositories need the same session.

See [architecture.md](architecture.md) for a detailed walkthrough of pipeline gates, relationships, and Explorer behavior.

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

Artifact keys are typed (`REQ-001`, `TST-001`, …). Version 1 starts as `DRAFT`.

### 5.3 Generate Gherkin (always DRAFT)

With Ollama (or another configured provider):

```bash
pnpm setwin -- requirement gherkin REQ-001
pnpm setwin -- gherkin show TST-001
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
pnpm setwin -- relate TST-001 VALIDATES REQ-001
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

In the UI: use **Dashboard → Log in** with username/password (or paste a CLI token under Advanced). Then open Twin Explorer, **Repositories**, Reviews, Approvals, Audit, and AI activity.

---

## 8. Connect a real product repository

SETwin is **not** a replacement for Git. Your product repo stays the source of code (and usually of `.feature` / test files). SETwin is the twin that remembers requirements, versions, reviews, approvals, and an indexed code graph.

```text
Your product git clone  --register/index-->  SETwin twin (Postgres)
        |                                         |
     source code                           REQ / TST / reviews
     tests / features                      approvals / audit
```

### 8.1 From the Web UI (recommended)

1. Create a twin project (CLI once):  
   `pnpm setwin -- project create myproduct --name "My Product"`
2. Sign in on Dashboard.
3. Open **Repositories** (`http://localhost:5173/repos`).
4. Choose the project, paste an **absolute local path** to a git checkout the API can read, e.g. `C:\work\my-product`.
5. Click **Register**, then **Index**.
6. Use **Symbols** to browse the indexed code graph.

The path must exist on the machine running `pnpm dev` (same laptop for local use).

### 8.2 From the CLI

```bash
pnpm setwin -- project create myproduct --name "My Product"
pnpm setwin -- repo register --project myproduct --path C:\work\my-product
pnpm setwin -- repo list
pnpm setwin -- repo index <repositoryId>
pnpm setwin -- repo symbols <repositoryId>
```

### 8.3 Requirements and tests from that product

Today these are **twin artifacts**, not an automatic full import of every file in the repo:

| In the product repo | In SETwin |
|---|---|
| Source code | Indexed via **Repositories → Index** |
| Requirement text / docs | `requirement create` or Twin artifacts |
| `.feature` files | `gherkin create --file … --requirement REQ-…` |
| Reviews / approvals | `workflow` / `review` (or UI) |

Example — pull a feature file from the product repo into the twin:

```bash
pnpm setwin -- requirement create "Customers can cancel an unpaid order within 30 minutes." --project myproduct
pnpm setwin -- gherkin create --project myproduct --file C:\work\my-product\features\cancel.feature --requirement REQ-001
pnpm setwin -- workflow submit REQ-001
```

Change impact against that registered repo:

```bash
pnpm setwin -- change analyze --repository <repositoryId> --base main --head HEAD
```

**Not built yet as a single “import whole repo as the product” wizard:** automatic discovery of all requirements/tests from arbitrary folder layouts, bi-directional sync of every file, or treating Git as the only store for approved twin state. Register + index + create/link artifacts is the supported path now.

---

## 9. AI gateway (optional)

Configure providers in `.env` (see `.env.example`). Ollama-first:

```bash
# SETWIN_OLLAMA_BASE_URL=http://127.0.0.1:11434
# SETWIN_OLLAMA_MODEL=qwen2.5:7b
```

To append each LLM request and response, with start, finish, and duration, to a readable file (off by default):

```bash
SETWIN_LLM_LOG_REQUESTS=true
# Default path is data/llm.log
# SETWIN_LLM_LOG_FILE=./data/llm.log
# Optional truncate length (default 16000; 0 = no truncate)
# SETWIN_LLM_LOG_MAX_CHARS=16000
```

Restart the API after changing these. Each exchange is a plain-text block in that file. The API log also records `llm.log` with `durationMs`.

```bash
pnpm setwin -- ai complete --prompt "Summarize cancel-order acceptance criteria"
pnpm setwin -- ai actions
```

All model calls go through the gateway. Unconfigured providers fail gracefully.

---

## 10. MCP server (optional)

```bash
pnpm mcp
```

MCP speaks JSON-RPC over stdio and uses the same domain services as CLI/API (no direct database access). Point your MCP client at this process when integrating IDEs or agents.

---

## 11. Later capabilities (short reference)

These are available after the core slice works. Use `--help` on each command for flags.

| Area | Commands |
|---|---|
| Repository | `repo register`, `repo index`, `repo list`, `repo symbols` |
| Change | `change analyze`, `change list` (see `pnpm setwin -- change --help`) |
| Context | `context ingest`, `context search` |
| AI scrum / coding agents | `agent skills`, `agent propose`, `agent proposals`, `agent coding` |
| Stories / requirements (PO / QE) | `requirement stories`, `requirement edit`, `requirement submit`, `requirement revise-rejection`, `requirement follow-on`, `requirement gherkin` |
| Testing | `test ingest`, `test list` |
| CI/CD | `cicd adapters`, `cicd render` |
| OpenSecant | `opensecant generate`, `opensecant execute` |
| OpenVector metrics | `metrics record`, `metrics series`, `metrics events` |
| Integrations | `integration list`, `integration sync` |

Templates also live under `templates/` and `.github/workflows/` for GitHub Actions / GitLab / Jenkins / Azure DevOps.

---

## 12. Common failures

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
| Repository path rejected | Absolute local git path readable by the API process; project must exist |

Get help for any command:

```bash
pnpm setwin -- --help
pnpm setwin -- review --help
pnpm setwin -- requirement --help
```

---

## 13. What not to do

- Do not extend the Python prototype under `setwin/` with new product phases.
- Do not treat AI drafts as approved.
- Do not rewrite an `APPROVED` version in place—create the next `DRAFT`.
- Do not commit `.env`, `data/session.json`, or real secrets.
