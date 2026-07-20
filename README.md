# USA Project

Administrative and public-facing auditing tools for a ROBLOX community roleplaying a mock United
States Government. The functional spec lives in [PROJECT.md](PROJECT.md), the technical design in
[DESIGN.md](DESIGN.md), and the phased roadmap in
[implementation-breakdown/](implementation-breakdown/00-roadmap-overview.md).

## Workspace layout

npm workspaces monorepo:

```
apps/
  api/        Express 5 API, background jobs, and the separate-origin PDF proxy
  web/        Vue 3 + Vuetify 4 SPA (Vite, vue-router, TanStack Query)
packages/
  shared/     Single source of truth: claim keys, bill enums, congress-session
              math, shared zod schemas
infra/        docker-compose.yml + Dockerfiles
```

## Prerequisites

- Docker (with the Compose plugin) — the only hard requirement for running the stack.
- Node.js ≥ 22 and npm — for running lint/tests or the apps outside Docker.

## Quickstart (Docker)

```sh
cp .env.example .env   # defaults work out of the box for local dev
docker compose up
```

This brings up:

| Service        | URL                                   | Notes                             |
| -------------- | ------------------------------------- | --------------------------------- |
| Web (Vite dev) | http://localhost:5173                 | Vuetify shell, proxies `/api`     |
| API            | http://localhost:3000/api/health      | Migrations apply on boot          |
| File origin    | http://localhost:3001/health          | Serves stored PDFs (see below)    |
| Postgres       | postgresql://localhost:5432           | Credentials from `.env`           |
| MinIO          | http://localhost:9000 (console: 9001) | Local Cloudflare R2 stand-in; the |
|                |                                       | documents bucket is auto-created  |

Both apps hot-reload: the repository is bind-mounted into the containers. `node_modules` live in
named Docker volumes, so after changing dependencies run:

```sh
docker compose build
docker compose up --renew-anon-volumes
```

## Running without Docker

Start Postgres and MinIO however you like (easiest: `docker compose up postgres minio minio-init`),
then:

```sh
npm install
npm run dev   # builds packages/shared, then runs the API (tsx watch) + web (vite) together
```

The API reads the repo-root `.env` automatically when environment variables are not already set.

## Authentication — ROBLOX app registration

Login uses ROBLOX OAuth 2.0 (Authorization Code + PKCE). The stack boots without credentials —
`/auth/login` answers 503 until they are configured. To enable login:

1. Open the [ROBLOX Creator Hub](https://create.roblox.com/dashboard/credentials) and create an
   **OAuth 2.0 app** (this is a manual, one-time step).
2. Scopes: `openid` and `profile`.
3. Register **both** redirect URIs:
   - `https://<your-production-origin>/auth/callback`
   - `http://localhost:5173/auth/callback` (the Vite dev URL — ROBLOX requires HTTPS redirect
     URIs but exempts localhost. If that exemption is rejected at registration time, create a
     second dev-only OAuth app holding just the localhost URI and use its credentials in `.env`.)
4. Put the client id/secret in `.env` as `ROBLOX_CLIENT_ID` / `ROBLOX_CLIENT_SECRET`
   (restart the API afterwards).

How it fits together locally: the browser only ever talks to the Vite origin
(`http://localhost:5173`), which proxies both `/api/*` and `/auth/*` to the API, so the whole
OAuth round trip is same-origin — no CORS, and it works over plain http in every browser
(including Safari, which drops `Secure` cookies on insecure origins; the `Secure` flag is
env-driven via `COOKIE_SECURE` and off by default in development). `APP_BASE_URL` is the single
source for the redirect URI and post-login redirect — point it at the origin users actually visit.

Sessions are server-side (Postgres `sessions` table) behind an httpOnly `SameSite=Lax` cookie
with sliding expiry; logout (`POST /auth/logout`) revokes server-side. ROBLOX user `9725456` is
seeded as the initial admin and can manage claims at `/admin` after logging in.

## Documents & the two-origin setup

User-submitted PDFs are treated as hostile (see DESIGN.md — PDF Storage & Safety). Uploads go
through the API (`POST /api/documents`, authenticated, 20 MB cap, `%PDF-` magic-byte check) into
MinIO locally / Cloudflare R2 in production. Files are **never served by the app origin**:
a second Express entry point streams them on their own port with
`Content-Security-Policy: sandbox`, `nosniff`, and immutable-cache headers, so a malicious PDF
runs in a context where there is no session and no app DOM to attack.

Locally the two origins are ports on localhost:

- App: `http://localhost:5173` (Vite; proxies `/api` and `/auth` to `localhost:3000`)
- Files: `http://localhost:3001/files/<document-id>` (`FILE_ORIGIN_BASE_URL`)

In production the file origin gets its own hostname (e.g. `files.example.com`) routed to the
file port; set `FILE_ORIGIN_BASE_URL` accordingly. Admins can quarantine any document at
`/admin` → Documents — its URL answers `410 Gone` from the next request on.

Every mutation on the platform lands in the append-only `audit_events` table (UPDATE/DELETE are
rejected by a database trigger). Holders of `audit:view` can browse and filter the log at
`/admin` → Audit log, inspect before/after snapshots, and — with the `admin` claim — restore an
opted-in record from its `before` snapshot.

## Bill tracking

Bills (see PROJECT.md — Bill Tracking & Signing) live at `/bills`: a public list (filter by
session, chamber, status, tags; search by display id or title) and a public detail page showing
the stage pipeline, per-member votes with live tallies, tags, and every PDF version in the
sandboxed viewer. Anonymous users see everything; mutations are claim-gated:

- **Submission** (`bill:submit`) — the origin chamber comes from the submitter's roster
  membership; the identifier (`HB8401` = House bill, session 84, sequence 01) is assigned
  transactionally from a per-`(chamber, session)` counter, capped at 99 bills per chamber per
  session. New PDF versions between stages use the same claim.
- **Stage outcomes** are declared manually (recorded tallies are documentation, not the trigger):
  committee and origin floor need the origin chamber's `bill:vote-update:house|senate` claim, the
  other floor needs the other chamber's, sign/veto needs `bill:sign`, and the veto override
  returns to the origin chamber's claim.
- **Votes** are bulk-entered per stage event against the chamber roster (yea/nay/abstain/absent);
  members missing from the roster need explicit confirmation. Corrections supersede rather than
  mutate, so tallies stay auditable; admins may correct any tally.

The **Congress session advances by calendar month** (July 2026 = session 84, evaluated in US
Eastern time). A daily 00:05 ET job — plus a lazy check on any bill mutation — marks still-active
bills from prior sessions `DIED_IN_SESSION`.

**Rosters** sync daily from the Congress group (2673501): admins map group ranks to chambers at
`/admin` → Rosters (with no rules the sync classifies nobody), and `roster:resync` holders can
force an immediate sync there. The **tag vocabulary** is managed at `/admin` → Tags
(`tags:manage`); anyone with `bill:submit` can tag bills.

## Development commands

All from the repository root:

```sh
npm run lint        # ESLint (flat config), zero-warning budget
npm run typecheck   # tsc project references + vue-tsc for the SPA
npm test            # Vitest (packages/shared + apps/api), hermetic — no database needed
npm run build       # all workspaces
npm run format      # Prettier over the whole repo
```

Integration tests (real Postgres; covers concurrent bill submission, per-chamber claim
enforcement, vote supersession, session rollover) are gated on `TEST_DATABASE_URL` and skipped
without it. With the compose Postgres running they work out of the box — the script defaults the
URL to a disposable `aero_test` database on the compose instance, creating it if missing:

```sh
docker compose up -d postgres
npm run test:integration --workspace @aero/api
```

Database migrations live in `apps/api/drizzle/` and are applied automatically when the API boots.
After editing `apps/api/src/db/schema.ts`, generate a new migration with:

```sh
npm run db:generate --workspace @aero/api
```

### Demo data

To populate the public pages with realistic sample content — bills across every
pipeline status (with versioned PDFs, per-member votes, and tags), court rulings
(including an appeal and an expunged record), businesses, and Congress rosters —
run the dev-only seeder against a running stack:

```sh
docker compose up -d               # stack must be up (Postgres + MinIO)
npm run db:seed --workspace @aero/api
```

It reuses the real upload pipeline, so every seeded PDF is a genuine object in
MinIO that renders in the sandboxed viewer. It is re-runnable (demo rows are
cleared first) and refuses to run when `NODE_ENV=production`. This is **not** a
migration — it never runs on boot.

## Configuration & secrets

All configuration flows through environment variables, validated at startup by the zod schema in
`apps/api/src/config.ts` — the API refuses to boot on missing/malformed config and never logs
secret values. `.env` is gitignored; [.env.example](.env.example) documents every variable. In
deployed environments, use the provider's secret store or Docker secrets — nothing secret is
committed or baked into images.

## Deployment

Deployment tooling (production compose file, prod Dockerfile targets, reverse proxy + TLS) arrives
in phase 08 of the [roadmap](implementation-breakdown/00-roadmap-overview.md). The dev compose
stack is intentionally portable: everything runs from generic Docker images with no
provider-specific configuration.
