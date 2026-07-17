# Technical Design

This document is the authoritative technical design for the USA Project: a web platform providing administrative and public-facing auditing tools for a ROBLOX community roleplaying a mock United States Government. The functional specification lives in [PROJECT.md](PROJECT.md); this document translates it into an architecture, data model, and set of technical decisions. The phased implementation plan lives in [implementation-breakdown/](implementation-breakdown/00-roadmap-overview.md).

## Resolved Design Decisions

These were open questions in the spec, resolved during design review (2026-07-07):

| Question                            | Decision                                                                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How do bill stages advance?         | **Manually.** A vote-update claim holder explicitly marks a stage passed/failed; recorded tallies are supporting documentation, not the trigger. The platform does not encode quorum/threshold rules. |
| Bills pending at session rollover?  | **They die.** Any bill not enacted when the Congress advances gets a terminal `DIED_IN_SESSION` status.                                                                                               |
| External API authentication?        | **API keys.** Admin-issued, per consuming service, revocable, rate-limited.                                                                                                                           |
| Who creates business registrations? | **Claim-gated.** A `business:register` claim holder creates the entry and assigns the owner.                                                                                                          |
| Who expunges / pardons?             | **Expunge: judge claim. Pardon: presidential claim.**                                                                                                                                                 |
| Database?                           | **PostgreSQL**, locked in. Cloud-hosted (Neon or Supabase free tier) in production, Docker container locally.                                                                                         |
| Deployment target?                  | **Undecided, kept portable.** Generic Docker Compose that runs on any container host or VPS; no provider-specific config in the initial build.                                                        |
| Vote attribution granularity?       | **Per-member at every voting stage** (committee, both floors, veto override), drawing from the chamber rosters. Positions: yea / nay / abstain / absent.                                              |

## Stack Summary

| Layer            | Choice                                                     | Notes                                                                                                                   |
| ---------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Frontend         | Vue 3 + Vuetify 3                                          | SPA, Vite-built. TanStack Query (`@tanstack/vue-query`) for API calls and caching.                                      |
| Backend          | Node.js + Express 5                                        | TypeScript throughout.                                                                                                  |
| Database         | PostgreSQL 16+                                             | Drizzle ORM + drizzle-kit migrations (TypeScript-first, SQL-transparent, readable by maintainers).                      |
| File storage     | Cloudflare R2                                              | S3-compatible API. PDFs served from a **separate origin** — see [PDF Safety](#pdf-storage--safety).                     |
| Auth             | ROBLOX OAuth 2.0                                           | Authorization Code + PKCE. Server-side sessions in Postgres, httpOnly cookie.                                           |
| Deployment       | Docker / Docker Compose                                    | Portable across providers; local dev uses the same compose file with a Postgres container and MinIO standing in for R2. |
| Language/tooling | TypeScript strict, ESLint (flat config) + Prettier, Vitest | Shared lint config across all workspaces.                                                                               |

## Monorepo Layout

npm workspaces (no extra tooling beyond Node itself):

```
/
├── apps/
│   ├── web/                  # Vue 3 + Vuetify SPA
│   └── api/                  # Express API + background jobs + file proxy
├── packages/
│   └── shared/               # Shared TypeScript: claim keys, bill stage/status
│                             # enums, zod schemas for API payloads, display-ID
│                             # formatting, congress-session math
├── infra/
│   ├── docker-compose.yml            # local: api, web, postgres, minio
│   ├── docker-compose.prod.yml       # deployed: api, web (or combined)
│   └── Dockerfile.*
├── implementation-breakdown/  # phased roadmap
├── DESIGN.md                  # this file
├── PROJECT.md                 # functional spec
└── README.md                  # run & deploy instructions (kept current)
```

`packages/shared` is the single source of truth for every enum and claim key. The bill stage list, bill status list, vote positions, ruling outcome semantics, and claim key registry are defined once there and imported by both apps — this satisfies the spec's requirement that the stage list be "defined in a single place" and keeps frontend permission rendering in lockstep with backend enforcement.

## Authentication & Sessions

1. `GET /auth/login` redirects to ROBLOX OAuth (`authorize` endpoint) with Authorization Code + PKCE, scopes `openid profile`.
2. Callback exchanges the code, reads the ROBLOX user id + username from the ID token / userinfo, and upserts a row in `users` (roblox id is the primary identity; username/display name/avatar are cached snapshots refreshed at login).
3. A server-side session row is created in Postgres; the browser gets an httpOnly, `SameSite=Lax`, `Secure` cookie holding only the session id. Server-side sessions are trivially revocable (needed for negative claims and admin action) and avoid JWT invalidation problems.
4. Anonymous users can browse all public content (bills, votes, court records, businesses); the session is only required for gated actions.

ROBLOX OAuth client id/secret are configuration secrets — see [Secrets](#configuration--secrets).

## Claims & Permissions

### Model

Three tables drive the whole permission system:

- **`claim_definitions`** — registry of claim keys (`admin`, `bill:submit`, `bill:vote-update:house`, `bill:vote-update:senate`, `bill:sign`, `court:submit`, `court:appeal-verdict`, `court:expunge`, `court:pardon`, `business:register`, `business:license-grant`, `tags:manage`, `roster:resync`, `claims:manage`, `apikey:manage`, `audit:view`, plus future `medals:grant`). Keys themselves are constants in `packages/shared`; the table carries descriptions and lets admins see what exists.
- **`group_claim_mappings`** — `(claim_key, group_id, comparison ∈ {>=, ==, <=}, rank_value)`. A user holds the claim if their rank in the ROBLOX group satisfies the comparison. Multiple mappings per claim are OR'd. Admin-manageable in-platform, so new roles/features never require schema changes.
- **`direct_claim_grants`** — `(user_id, claim_key, is_negative, granted_by, granted_at, revoked_at)`. Positive grants add a claim; **negative grants block it unconditionally**.

### Resolution & freshness

Effective claims = (group-derived claims ∪ positive direct grants) − negative grants.

- Group-derived claims resolve through the ROBLOX Groups API (`GET /v2/users/{id}/groups/roles`), cached per user with a **15-minute TTL** in a `user_group_cache` table. Gated backend actions re-resolve through this cache, so a claim backed by a lost group role expires within the TTL.
- **Negative claims bypass the cache entirely**: the claims middleware always reads active negative grants live from Postgres, so a block takes effect on the next request, immediately.
- The frontend receives the merged claim set from `GET /api/me` (and caches it via TanStack Query) to render permitted functions. This is display-only; every mutation is re-checked server-side by `requireClaim(key)` middleware.

### Seeding

A idempotent seed migration grants `admin` (direct grant) to ROBLOX user `9725456`. The `admin` claim implicitly satisfies `claims:manage`, `tags:manage`, `apikey:manage`, and `audit:view`.

## Data Model (Postgres)

Overview of principal tables beyond the claims tables above. All tables carry `created_at`/`updated_at`; user-facing records use **soft deletes** (`deleted_at`) so admin rollback is always possible.

### Core

- **`users`** — `roblox_user_id` (PK), cached `username`, `display_name`, `avatar_url`, `last_login_at`.
- **`sessions`** — session id, user, expiry.
- **`audit_events`** — see [Auditing](#auditing).
- **`documents`** — every stored PDF: object key (random UUID, never user-derived), uploader, byte size, SHA-256, upload timestamp, `quarantined_at` (admin takedown flag). Bills and judgments reference documents rather than owning file metadata, so the safety pipeline is shared.

### Bills

- **`congress_rosters`** — `(chamber ∈ {house, senate}, roblox_user_id, username_snapshot, rank, active, first_seen_at, last_confirmed_at)`. Refreshed daily from the Congress group (id 2673501) via the Groups API; which rank ranges map to House vs. Senate membership is admin-configurable (a small `roster_rank_rules` table). Force-resync gated by `roster:resync`.
- **`bills`** — `chamber ∈ {H, S}`, `session` (int), `sequence` (int, 1–99), `title`, `status`, `submitted_by`, timestamps. `UNIQUE (chamber, session, sequence)`; sequence assigned inside a transaction from a per-`(chamber, session)` counter. Display id (`HB8001`) is derived, never stored as the identity.
- **`bill_versions`** — `(bill_id, version_no, document_id, uploaded_by)`. Every PDF revision is a new row; nothing is overwritten.
- **`bill_stage_events`** — `(bill_id, stage, outcome, decided_by, decided_at, notes)`. One row per stage transition; the append-only history of the pipeline.
- **`bill_votes`** — `(stage_event_id, roblox_user_id, position ∈ {yea, nay, abstain, absent}, recorded_by, superseded_by)`. Corrections insert a new row and mark the old one superseded — tallies stay auditable.
- **`tags`** / **`bill_tags`** — tag vocabulary is `tags:manage` (admin); applying tags requires `bill:submit`.

**Bill status** is a single enum defined in `packages/shared`:
`IN_COMMITTEE → ORIGIN_FLOOR → OTHER_FLOOR → PRESIDENTIAL → (ENACTED | VETOED) → VETO_OVERRIDE → (ENACTED_BY_OVERRIDE | VETO_SUSTAINED)`, with terminal failure states `FAILED_COMMITTEE`, `FAILED_ORIGIN_FLOOR`, `FAILED_OTHER_FLOOR`, and `DIED_IN_SESSION`. Legal transitions are encoded in one shared transition map so making the pipeline configurable later is a data change, not a logic hunt.

**Congress session math** lives in `packages/shared`: `session = 84 + monthsBetween(2026-07, now)` evaluated in `America/New_York`. It is computed, never manually advanced. A daily job (and a lazy check on bill mutation, as a belt-and-suspenders) marks still-active bills from prior sessions `DIED_IN_SESSION`.

### Judicial

- **`rulings`** — ruling date, `entered_by` (judge), `status ∈ {active, expunged, pardoned}`, `document_id` (judgment PDF), visibility flags. Expungement/pardon update status + visibility and never delete; the original record and audit trail persist. Expunged/pardoned records drop out of public queries and profile pages but remain visible to holders of an appropriate claim.
- **`ruling_parties`** — `(ruling_id, side ∈ {plaintiff, defendant}, party_type ∈ {user, business, government}, roblox_user_id?, business_id?)`. Linked entities, enabling profile/business-page display and party-type filtering. The API provides typeahead lookup (users by ROBLOX username/id, businesses by name) for the judge's entry experience.
- **`ruling_outcomes`** — vocabulary table (`guilty`, `not guilty`, `dismissed`, …), admin-manageable like tags; **`ruling_outcome_links`** joins rulings to one or more outcomes.
- **`appeals`** — `(ruling_id, verdict document_id, entered_by, entered_at, outcomes)`. Appeals go directly to the Supreme Court; entry gated by `court:appeal-verdict` (a higher judicial-group rank threshold than `court:submit`).

### Business

- **`businesses`** — name, `owner_user_id` (exactly one owner), status, `created_by` (registrar). Created by `business:register` holders; only the owner edits details.
- **`business_ownership_transfers`** — append-only transfer log (from, to, initiated_by, at).
- **`business_licenses`** — `(business_id, license_type, status, granted_by, granted_at, expires_at)`. Granting gated by `business:license-grant` (mapping to be wired by admins later, per spec).

### API keys

- **`api_keys`** — name/owner service, **hash** of the key (raw key shown once at issuance), created_by, `revoked_at`, rate-limit tier.

## Auditing

Every mutation passes through an audit layer that writes to **`audit_events`**: `(actor_user_id, action_key, entity_type, entity_id, before JSONB, after JSONB, occurred_at, request_ip)`. Properties:

- **Append-only.** The application role has no `UPDATE`/`DELETE` grant on the table; a Postgres trigger rejects both as defense in depth.
- **Rollback-capable.** `before` snapshots plus universal soft-deletes mean admins can restore tampered or deleted records from the audit UI (restoration is itself an audited action).
- **Visibility-gated.** Each `action_key` maps to a visibility level; sensitive categories require `audit:view` or `admin`, others are visible to involved parties.
- System events (roster syncs, session rollover, job failures) are logged with a system actor.

## PDF Storage & Safety

User-submitted PDFs are treated as hostile. The pipeline, shared by bills and judgments via `documents`:

**Upload (through the API, never direct-to-bucket from the browser):**

1. Authenticated + claim-checked multipart upload, hard size cap (20 MB).
2. Server validates the `%PDF-` magic bytes and content type; rejects anything else. (This is a sanity gate, not a malware scan — serving-side isolation is the real defense.)
3. Object stored in R2 under a random UUID key. User-supplied filenames are stored as display metadata only and sanitized before ever appearing in a header.

**Serving (the load-bearing defenses):**

1. PDFs are served from a **dedicated separate origin** (e.g. `files.example.gov-rp.com` vs. the app at `app.example.gov-rp.com`) — same-origin isolation means script execution inside a PDF viewer context can never touch the app's session or DOM.
2. The file origin is a thin streaming proxy (a separate Express entry point in `apps/api`, bound to its own hostname/port) that fetches from R2 and sets on every response:
   - `Content-Security-Policy: sandbox` (no scripts, no top-level navigation, opaque origin)
   - `Content-Type: application/pdf` + `X-Content-Type-Options: nosniff`
   - `Content-Disposition: inline; filename="<sanitized>.pdf"`
   - `Cross-Origin-Opener-Policy: same-origin`, `Referrer-Policy: no-referrer`
   - `Access-Control-Allow-Origin: <app origin>` (credential-less CORS so the app can fetch the raw bytes for rendering — see below)
3. In-app preview never uses the browser's native PDF viewer — native viewers refuse to run in a sandboxed context, so `CSP: sandbox` rules them out by design. Instead the app fetches the bytes cross-origin and rasterizes each page to a canvas with pdf.js (`PdfViewer.vue`): nothing embedded in a PDF ever executes. Navigating to a file URL directly downloads the file rather than rendering it.
4. Quarantine: setting `documents.quarantined_at` (admin action) makes the proxy return 410 immediately, platform-wide, without touching the bill/ruling records.

Locally, MinIO substitutes for R2 behind the same S3 client; the proxy runs on a second localhost port to simulate the separate origin.

## Public API

Read-only endpoints for other group services under `/api/public/v1/`:

- `GET /users/{robloxId}/court-record` — public (non-expunged, non-pardoned per visibility rules) rulings for a user.
- `GET /users/{robloxId}/businesses` — businesses owned.
- `GET /businesses/{id}` — registration + license status.
- `GET /bills/{displayId}` — bill status, stage history, votes.

Auth: `Authorization: Bearer <api key>`; keys are admin-issued (`apikey:manage`), stored hashed, revocable, rate-limited per key tier. Responses only ever contain data that is public in the web UI — API keys gate _access and rate_, not _extra visibility_. Versioned under `/v1/` so consumers survive changes.

Citizenship is explicitly **not** served here; consumers (and this platform, when it needs a citizenship date) query `https://osfusa.azurewebsites.net/api/immigration/{robloxId}/latest` directly.

## Background Jobs

In-process schedulers (node-cron) inside `apps/api`, with per-job locking rows in Postgres so a future multi-instance deployment doesn't double-run:

| Job               | Schedule                    | Purpose                                                                      |
| ----------------- | --------------------------- | ---------------------------------------------------------------------------- |
| Roster refresh    | Daily                       | Sync House/Senate rosters from the Congress group; mark departures inactive. |
| Session rollover  | Daily 00:05 ET + lazy check | Mark prior-session active bills `DIED_IN_SESSION`.                           |
| Session cleanup   | Hourly                      | Purge expired auth sessions.                                                 |
| Group cache sweep | Hourly                      | Evict stale `user_group_cache` rows.                                         |

## Configuration & Secrets

- All configuration flows through environment variables, validated at startup by a zod schema in `apps/api/src/config.ts` — the process refuses to boot with missing/malformed config, and secret values are never logged.
- Local: `.env` (gitignored) + committed `.env.example` documenting every variable.
- Deployed: the provider's secret store or Docker secrets; nothing secret is ever committed or baked into images.
- Secrets inventory: ROBLOX OAuth client id/secret, Postgres URL, R2 access key/secret/endpoint/bucket, session signing secret.

## Local vs. Deployed

Both run from the same images (README.md keeps the exact commands current):

- **Local:** `docker compose up` starts Postgres, MinIO, the API (app port + file-origin port), and the Vite dev server for the web app. Hot reload for both apps; migrations apply on boot.
- **Deployed:** `docker-compose.prod.yml` builds production images (static web build served by the API or a thin nginx), pointing at managed Postgres (Neon/Supabase) and real R2. A reverse proxy (Caddy in the compose file — automatic TLS) routes the app hostname and file hostname to their respective ports. Portable to any Docker-capable host; no provider lock-in.

## Future Scope Accommodations

User records (employment history, medals, citizenship) are out of the initial build, but the design leaves their seams:

- The claims registry already reserves `medals:grant`; adding medal tables touches nothing existing.
- The roster-sync job is written as a generic "poll a ROBLOX group daily and diff membership" module so pointing it at agency groups later yields employment timelines for free.
- Profile pages are composed of independent sections (bills, rulings, businesses), so new record types are additive.
- Citizenship stays external by design (see Public API).
