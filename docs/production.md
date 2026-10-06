# Running SE Twin in production

Local development needs a reachable Postgres. `docker compose up -d` starts a sample server. An existing Postgres is enough when `SETWIN_DATABASE_URL` points at it. Then run `pnpm dev` and `pnpm web`. This page is for a single host that runs the API, the web app, and Postgres together.

## Start

Choose a database password. The production compose file does not publish Postgres on the host.

```bash
set SETWIN_DB_PASSWORD=choose-a-long-password
docker compose -f docker-compose.prod.yml up -d --build
```

On macOS or Linux, use `export SETWIN_DB_PASSWORD=...` instead of `set`.

The API listens only inside the Docker network. The web container serves the app on port 80 and proxies `/api` to it. Open `http://localhost`.

Create the first administrator once the API is up. That account is the only administrator until you assign the role to someone else from Setup.

```bash
docker compose -f docker-compose.prod.yml exec api node --experimental-strip-types apps/cli/src/index.ts init
docker compose -f docker-compose.prod.yml exec api node --experimental-strip-types apps/cli/src/index.ts user create admin --password choose-an-admin-password
```

The image uses Node 22 and runs the TypeScript sources directly. Day-to-day development on Node 20 still uses `pnpm dev` (`tsx`).

## Sign-in

The browser session is an httpOnly cookie named `setwin_session`. It lasts 12 hours. Sign out revokes that session. A new sign-in also revokes that user’s other sessions.

The command-line login still returns a token and stores it in `data/session.json`. Do not commit that file.

Set `SETWIN_WEB_ORIGIN` to the exact origins the browser uses, separated by commas. The sample file allows `http://localhost` and `http://127.0.0.1`.

## TLS

Put HTTPS in front of port 80 before the site is reachable beyond your own machine. Then set:

```bash
SETWIN_WEB_ORIGIN=https://twin.example.com
SETWIN_COOKIE_SECURE=true
```

`SETWIN_COOKIE_SECURE` defaults to true when `SETWIN_ENV=production` and the variable is unset. The sample compose sets it to false so the cookie works on plain `http://localhost`. Turn it on when the browser is using HTTPS.

## Backup

Back up two things:

- The Postgres volume `setwin_pgdata`.
- The named volume `setwin_data`, which holds attachments and other files under the API data directory.

Restoring both from the same time keeps attachment files lined up with the database.

## Upgrade

Start the new image. On startup the API applies pending SQL and records it in `schema_migrations`. Existing tables are created with `CREATE TABLE IF NOT EXISTS` and are left in place. `002_password_params` adds the password cost column used to verify existing passwords.

## Who can see system detail

`GET /health` is public and reports only whether the process is up and whether Postgres answered. It does not include paths or the database URL.

`GET /status` requires an administrator. It is the detailed report (redacted database URL, data directories, host, and whether the catalog is initialized). The top bar uses `/health` for the database indicator, so other roles still see up or down.
