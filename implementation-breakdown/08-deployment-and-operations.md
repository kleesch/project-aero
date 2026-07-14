# Phase 08 — Deployment & Operations

**Depends on:** 07
**Goal:** A production deployment path that works on any Docker-capable host (provider deliberately undecided), with real R2, managed Postgres, TLS, backups, and documented operations.

## Tasks

### Production images & compose

- Finish the multi-stage Dockerfiles: web builds to static assets served by the API (or nginx sidecar); api image runs migrations then boots; non-root users; healthchecks.
- `infra/docker-compose.prod.yml`: api (app port + file-origin port), Caddy reverse proxy with automatic TLS routing **two hostnames** — the app origin and the file origin (the separate-origin PDF defense depends on this being configured correctly; make it hard to get wrong and loud when misconfigured, e.g. a boot-time check that the two configured origins differ).
- External services via env only: managed Postgres URL (Neon/Supabase), R2 credentials/endpoint/bucket. No local Postgres/MinIO in the prod compose.

### Jobs & multi-instance safety

- Postgres advisory-lock (or lock-row) wrapper around every cron job so a second api container never double-runs roster sync or session rollover.

### Secrets & config

- Document the production secret path: provider secret store or Docker secrets → env; verify the zod config gate covers every prod variable; confirm secrets never appear in logs or images.

### Backups & recovery

- Managed-Postgres backup verification (Neon/Supabase both provide PITR — document the restore procedure and test it once).
- R2 objects are immutable by design (versioned documents, no overwrite) — document that recovery = re-pointing, plus optional bucket-level object versioning as belt-and-suspenders.
- Write `docs/runbook.md`: restore DB, rotate each secret, revoke a compromised API key, quarantine a document, roster resync.

### Observability

- Structured logs to stdout (container-native); `GET /api/health` deep check (DB + bucket reachability) for uptime monitoring; job success/failure audit events reviewed via the admin audit UI.

### README

- Full deploy walkthrough: provision Postgres + R2, DNS for both hostnames, `.env` production template, `docker compose -f infra/docker-compose.prod.yml up -d`, first-login admin verification. Verified by executing it against a scratch VPS or local VM once.

## Deliverables

- One command deploys to any Docker host; README + runbook are sufficient for a maintainer who has never seen the codebase.

## Acceptance Criteria

- [ ] Fresh deploy from README alone succeeds on a clean host (dry-run test).
- [ ] App and file origins serve on distinct hostnames with valid TLS; boot fails loudly if they're configured identical.
- [ ] Two api replicas run jobs exactly once (advisory-lock test).
- [ ] A secret rotation (session secret, R2 keys) per the runbook causes no data loss and minimal downtime.
- [ ] Database restore procedure has been exercised once, successfully.
