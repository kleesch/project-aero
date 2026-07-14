# Phase 03 — Audit Log & PDF Pipeline

**Depends on:** 02
**Goal:** Every mutation is captured in an append-only audit log, and hostile-by-default PDF storage/serving is in place — the two safety systems every feature phase builds on.

## Tasks

### Audit layer

- Migration: `audit_events` (`actor_user_id`, `action_key`, `entity_type`, `entity_id`, `before` JSONB, `after` JSONB, `occurred_at`, `request_ip`). Postgres trigger rejecting UPDATE/DELETE; app DB role granted INSERT/SELECT only.
- `audit(action, entity, before, after)` service callable from route handlers inside the same transaction as the mutation; system-actor variant for jobs.
- Retrofit phase-02 mutations (claim mappings, grants, session-relevant admin actions) through the audit layer.
- Action-key → visibility-level map in `packages/shared`; `GET /api/audit` with filters (actor, entity, action, date range), gated by `audit:view`, respecting visibility levels.
- **Actor identity**: responses hydrate `actor_user_id` into the shared `UserRef` (`actor: UserRef | null`, null = system actor) via the existing `loadUserRefs` helper (`apps/api/src/services/user-refs.ts`) — one local batch query per response, never a raw id on the wire. Store only the id in `audit_events`; names resolve at read time from the `users` snapshot (the append-only table must not carry names that go stale).
- Admin audit UI: filterable table, before/after diff view. Actors render through the shared `formatUserRef` (as the claims admin UI already does) — admins see names, with `System` for null actors.
- **Restore-from-audit**: for soft-deleted or tampered records, an admin action that re-applies a `before` snapshot (itself audited). Implement generically now; feature phases opt their entities in.

### Document storage (upload)

- Migration: `documents` (uuid object key, uploader, size, sha256, mime, display filename, `quarantined_at`).
- S3 client (aws-sdk v3) targeting R2 in prod, MinIO locally — same code path.
- Upload service: multipart through the API only; 20 MB cap; `%PDF-` magic-byte + content-type validation; random UUID object key; filename sanitized and stored as metadata only.

### File origin (serving)

- Second Express entry point (own port/hostname — the separate origin) streaming objects from the bucket. No cookies, no session code loaded.
- Response headers on every file: `Content-Security-Policy: sandbox`, `Content-Type: application/pdf`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename="<sanitized>.pdf"`, `Cross-Origin-Opener-Policy: same-origin`, `Referrer-Policy: no-referrer`, long-lived immutable cache headers (content is immutable per version).
- Quarantined documents → 410 on the file origin.
- Compose wiring: expose the file port; document the two-origin setup locally (e.g. `localhost:3000` app, `localhost:3001` files).

### Quarantine & takedown

- `POST /api/admin/documents/:id/quarantine` (+ un-quarantine), `admin`-gated, audited, with reason.
- Admin documents UI: recent uploads, uploader (as `UserRef` via `loadUserRefs` + `formatUserRef`), quarantine toggle.

### Frontend

- Shared PDF viewer component: renders the file-origin URL in a sandboxed `<iframe>` with a download fallback link.

## Deliverables

- Audit service + UI live; uploads round-trip to MinIO and render in the sandboxed viewer; quarantine kills serving instantly.

## Acceptance Criteria

- [ ] Direct SQL `UPDATE audit_events …` fails at the DB level.
- [ ] Upload rejects: >20 MB, non-PDF magic bytes, wrong content type; accepts a real PDF.
- [ ] Served file responses carry every header listed above (integration-tested), and the serving origin differs from the app origin.
- [ ] A PDF containing embedded JavaScript renders inert in the viewer (manual check).
- [ ] Quarantining a document makes its URL return 410 within one request.
- [ ] Restoring a record from a `before` snapshot works and produces its own audit event.
- [ ] Audit rows and document listings show actors/uploaders by name (`UserRef` hydration), never a bare numeric id; system actions render as `System`.
