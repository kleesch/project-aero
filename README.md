# USA Project

Administrative and public-facing auditing tools for a ROBLOX community roleplaying a mock United
States Government. The functional spec lives in [PROJECT.md](PROJECT.md), the technical design in
[DESIGN.md](DESIGN.md), and the phased roadmap in
[implementation-breakdown/](implementation-breakdown/00-roadmap-overview.md).

## Workspace layout

npm workspaces monorepo:

```
apps/
  api/        Express 5 API, background jobs, (future) PDF file-origin proxy
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

| Service        | URL                                            | Notes                              |
| -------------- | ---------------------------------------------- | ---------------------------------- |
| Web (Vite dev) | http://localhost:5173                          | Vuetify shell, proxies `/api`      |
| API            | http://localhost:3000/api/health               | Migrations apply on boot           |
| File origin    | http://localhost:3001                          | Reserved; wired up in phase 03     |
| Postgres       | postgresql://localhost:5432                    | Credentials from `.env`            |
| MinIO          | http://localhost:9000 (console: 9001)          | Local Cloudflare R2 stand-in; the  |
|                |                                                | documents bucket is auto-created   |

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

## Development commands

All from the repository root:

```sh
npm run lint        # ESLint (flat config), zero-warning budget
npm run typecheck   # tsc project references + vue-tsc for the SPA
npm test            # Vitest (packages/shared for now)
npm run build       # all workspaces
npm run format      # Prettier over the whole repo
```

Database migrations live in `apps/api/drizzle/` and are applied automatically when the API boots.
After editing `apps/api/src/db/schema.ts`, generate a new migration with:

```sh
npm run db:generate --workspace @aero/api
```

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
