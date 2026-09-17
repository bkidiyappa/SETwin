# Third-party software

SETwin prefers established open-source libraries over proprietary reimplementation. Exact TypeScript versions are pinned in `pnpm-lock.yaml`. Exact Python prototype versions are pinned in `uv.lock`.

## TypeScript core (plan of record)

| Project | Purpose | Why needed | Why existing dependencies are insufficient | License | Required / Optional | Replacement strategy |
|---|---|---|---|---|---|---|
| Fastify | HTTP API | Phase 0 requires health/status endpoints | Node stdlib has no web framework with schema and hooks | MIT | Required | Another Node HTTP framework behind the same services |
| Zod | Config validation | Typed, validated settings from env | Manual parsing would duplicate validation | MIT | Required | Another schema library in `@setwin/config` |
| Drizzle ORM | Database access | Query identity and twin tables | Node stdlib has no ORM | Apache-2.0 | Required | Another SQL toolkit in `@setwin/database` |
| postgres (postgres.js) | PostgreSQL driver | Drizzle still needs a client | Drizzle is not a wire protocol | MIT | Required | `pg` or another driver |
| Pino | Structured logging | JSON logs with correlation IDs | console.log is not structured | MIT | Required | Another logger in `@setwin/config` |
| Commander | CLI | `setwin` command surface | Node stdlib argv parsing is too low-level | MIT | Required | Another CLI toolkit in `@setwin/cli` |
| @cucumber/gherkin | Gherkin parser | Phase 3 requires Feature/Scenario/Step validation | Do not write a Gherkin parser | MIT | Required | Another spec-compliant parser behind `parseGherkin` |
| @cucumber/messages | Cucumber AST types | Required peer of `@cucumber/gherkin` | Parser AST types live here | MIT | Required | Follow the parser replacement |
| TypeScript compiler API | Code parsing foundation | Phase 9 repository intelligence for TS/JS | Avoid native Tree-sitter binaries on Windows CI by default | Apache-2.0 | Required | Tree-sitter grammars behind the same parse API |
| React | Web UI | Phase 19 interactive twin explorer | Plain HTML would duplicate SPA routing and state | MIT | Required | Another UI library in `apps/web` |
| React Router | Web navigation | Dashboard/Twin/Reviews/Audit pages | Manual hash routing is brittle | MIT | Required | Another router |
| Vite | Web bundler/dev server | Fast local UI development | Manual ESBuild wiring is more work | MIT | Required | Another bundler |
| dotenv | `.env` loading | Local development configuration | Not needed if the process environment is already set | BSD-2-Clause | Required for local dev | OS environment only |
| Vitest | Tests | Required test runner | — | MIT | Development | Node test runner |
| tsx | TypeScript execution | Run CLI/API without a separate emit step | `tsc` would also work | MIT | Development | `tsc` + `node` |
| TypeScript | Language | Plan of record is TypeScript | — | Apache-2.0 | Required | — |

PostgreSQL 16 with the `pgvector/pgvector:pg16` image is the local database (pgvector-ready for Phase 11 embeddings stored as JSON today).

Optional remote services accessed via HTTP (no SDKs required for core): Ollama, OpenAI, Anthropic, Azure OpenAI, Gemini, Bedrock proxy, Jira, Azure DevOps, Confluence, GitHub, GitLab, Bitbucket, Figma, OIDC/SAML metadata endpoints.

## Python prototype (do not extend)

| Dependency | Purpose | License | Mandatory or optional |
|---|---|---|---|
| FastAPI | Prototype HTTP API | MIT | Prototype only |
| Uvicorn | Prototype ASGI server | BSD-3-Clause | Prototype only |
| Pydantic Settings | Prototype configuration | MIT | Prototype only |
| SQLAlchemy | Prototype ORM | MIT | Prototype only |
| Alembic | Prototype migrations | MIT | Prototype only |
| psycopg | Prototype PostgreSQL driver | LGPL-3.0 | Prototype only |
| Typer | Prototype CLI | MIT | Prototype only |
| pytest | Prototype tests | MIT | Prototype only |
| httpx | Prototype API tests | BSD-3-Clause | Prototype only |
