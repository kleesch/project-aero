# Phase 01 — Foundation & Tooling

**Depends on:** nothing
**Goal:** A running skeleton: monorepo with lint/typecheck wired, `docker compose up` brings up Postgres, MinIO, an Express API that answers a health check, and a Vuetify shell page.

## Tasks

### Monorepo scaffold

- Initialize npm workspaces: `apps/web`, `apps/api`, `packages/shared`.
- Root `package.json` scripts: `dev`, `build`, `lint`, `typecheck`, `test` fanning out to workspaces.
- TypeScript project references; strict mode in a shared `tsconfig.base.json`.
- ESLint flat config + Prettier as a root-level shared config; `lint` must pass with zero warnings in CI mode.
- `.editorconfig`, `.gitignore` (env files, dist, node_modules, `.DS_Store` — also remove the already-staged `.DS_Store` from git).

### packages/shared

- Claim key registry (const object + type) with all keys from DESIGN.md.
- Bill stage/status enums and the legal-transition map (contents wired in phase 04, structure now).
- Congress session math: `sessionForDate(date): number` using `America/New_York` (epoch: 2026-07 = 84) and `formatBillId(chamber, session, sequence)`. **Vitest tests for both, including month-boundary and DST cases.**
- Zod schema location conventions (schemas added per-phase).

### apps/api

- Express 5 + TypeScript, structured as `routes/`, `middleware/`, `services/`, `db/`, `jobs/`, `config.ts`.
- `config.ts`: zod-validated env loading; process exits with a clear message on invalid config.
- Drizzle ORM + drizzle-kit set up against Postgres; migration apply-on-boot; initial migration creates `users` table only.
- Pino (or similar) structured logging; request logging middleware.
- `GET /api/health` returning build info + DB connectivity.

### apps/web

- Vue 3 + Vite + Vuetify 3 + vue-router + `@tanstack/vue-query`.
- App shell: nav drawer/top bar with placeholder routes (Bills, Courts, Businesses, Admin), Vuetify theme configured.
- Dev proxy from Vite to the API.

### infra

- `infra/docker-compose.yml`: postgres:16, minio (+ bucket bootstrap), api (two exposed ports — app + future file origin), web dev server. Volumes for DB/MinIO persistence.
- Multi-stage Dockerfiles for api and web (dev target now; prod target completed in phase 08).
- `.env.example` with every variable introduced so far.

### Docs

- README.md: prerequisites, `docker compose up` quickstart, workspace layout, lint/test commands.

## Deliverables

- `docker compose up` → healthy API, Vuetify shell in browser, Postgres migrated, MinIO bucket present.
- CI-runnable `npm run lint && npm run typecheck && npm test` all green.

## Acceptance Criteria

- [ ] Fresh clone + `.env` from example + `docker compose up` works with no manual steps.
- [ ] `sessionForDate` tests pass, including: 2026-07 → 84, 2026-08 → 85, a date at 23:59 ET on a month's last day vs. 00:01 ET the next day yield adjacent sessions.
- [ ] Lint/typecheck/test green at the root.
- [ ] README instructions verified by following them literally.
