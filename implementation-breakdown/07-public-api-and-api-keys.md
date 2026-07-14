# Phase 07 — Public API & API Keys

**Depends on:** 04, 05, 06
**Goal:** Other group services can query court records, business status, and bills through a versioned, key-authenticated, rate-limited read-only API.

## Tasks

### API keys

- Migration: `api_keys` (service name, key **hash** — argon2/sha256 of a high-entropy token, `created_by`, `revoked_at`, rate-limit tier).
- Issuance gated `apikey:manage`: raw key displayed exactly once; audited. Revocation immediate.
- `Authorization: Bearer <key>` middleware: hash lookup, revocation check, per-key rate limiting (fixed-window in Postgres is sufficient at this scale; swap-in point documented if Redis ever arrives). 429 with `Retry-After` on breach.
- Admin UI: key list with usage counts, issue/revoke.

### Endpoints (`/api/public/v1/`)

- `GET /users/{robloxId}/court-record` — visibility-filtered rulings (expunged/pardoned excluded — reuse phase 05's visibility logic, never reimplement it).
- `GET /users/{robloxId}/businesses` — owned businesses + license summaries.
- `GET /businesses/{id}` — registration + licenses.
- `GET /bills/{displayId}` — status, stage history, tallies (parse display id via the shared formatter's inverse).
- Response shapes defined as zod schemas in `packages/shared`; consistent envelope + error format; ETag/cache headers on stable resources.
- **Parity rule enforced in code review and tests: these endpoints must never expose anything the anonymous web UI doesn't.**

### Docs

- `docs/public-api.md`: endpoints, auth, rate limits, example responses; linked from README.

## Deliverables

- A consumer with an issued key can query all four endpoint families; revocation and rate limits work.

## Acceptance Criteria

- [ ] Requests without a key, with a revoked key, or with a mangled key → 401; over-limit → 429 with `Retry-After`.
- [ ] Raw keys are irrecoverable from the database (hash only).
- [ ] Court-record endpoint omits an expunged ruling that an authenticated judge can still see in the web UI (explicit test).
- [ ] `GET /bills/HB8001`-style lookups resolve correctly, including 3-digit sessions (HB10022).
- [ ] Key issuance and revocation appear in the audit log.
