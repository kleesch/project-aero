# Phase 10 — Executive Orders

**Depends on:** 03 (audit + PDF pipeline); reuses the phase-05/06 user lookup and profile sections
**Goal:** An in-platform public Executive Order record: numbered EOs with PDFs, issuing presidents, statuses (active / repealed / expired / superseded), repeal chains, and summaries.

**Scope note — migration is out of scope.** The ~90 existing orders in the current Notion/Google-Drive archive are **not** migrated as part of this phase, and this build must not reach into Notion or Drive. The data model is designed for the platform's own needs; the team writes its own shims against the finished schema afterwards to load historical data. The only concession to that future backfill is that the model must *accept* explicit EO numbers and effective dates (below) — a clean insert path a shim can target, not an importer.

## Field coverage (reference, not an import contract)

The current Notion archive is the reference for *which fields the record needs to carry* — nothing more. For each, the platform representation:

| Field           | Notes                                                        | Platform representation                                             |
| --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| EO # (`EO #01`) | Sequential, platform-wide (not per-president)               | `eo_number` int, unique; display id `EO #12` derived                |
| Title           | Free-text; repeal orders titled "Repealing of EO #09"       | `title`; repeal is an explicit link, not a naming convention        |
| Effective date  | Calendar date                                               | `effective_date` (date, not instant)                                |
| PDF             | One PDF per EO                                               | `documents` pipeline — sandboxed separate-origin viewer             |
| President       | One issuing administration per order                        | `issued_by` → users FK (stub rows for presidents who never log in)  |
| Status          | Active / Repealed / Expired / Superseded                    | Stored: active/repealed/superseded; **expired is derived** (below)  |
| Summary         | Prose summary per order                                      | `summary` (nullable text) + a "missing summary" filter for editors  |

## Design decisions

1. **Numbering is manual-with-suggestion, validated, unique.** `eo_number` is entered on the form, auto-suggested as `max + 1` (the field is prefilled but editable, so gaps and out-of-order backfill are possible). One platform-wide sequence — no session math. Validation is layered:
   - **Schema:** unique constraint on `eo_number` as the final backstop.
   - **API:** zod rejects non-positive / non-integer numbers (400); a collision with an existing order returns a clear **409** ("EO #12 already exists"), never a raw unique-violation. The suggestion endpoint (or the create response path) exposes the current `max + 1`.
   - **Form:** prefills the suggestion, blocks submit on empty/≤0, and surfaces the 409 inline so the editor can pick another number rather than losing the upload.
2. **One claim: `eo:manage`.** Issue, edit, and status corrections all sit behind a new registry claim (definition seeded by migration, like `business:*`). Admins wire it to the main group's presidential rank via the existing phase-02 mapping UI — no deploy when the presidency changes hands. `admin` does not imply it (consistent with `bill:sign`).
3. **Repeals are links, not titles.** Issuing an EO can declare "repeals EO #X": in one transaction the new order is inserted, the target's status flips to `repealed`, and `repealed_by_eo_id` is set — so both detail pages cross-link ("Repealed by EO #10 on 2020-03-07") and the flip is audited. `superseded_by_eo_id` works identically for revisions (the "(Revised)" pattern). A standalone status-correction action (reason required, audited) covers mistakes and any state a shim can't set through the normal insert path.
4. **`expired` is derived, never stored** — the phase-06 license pattern. Temporary EOs carry an optional `expires_at`; an active order past it renders `expired` at read time (stored `repealed`/`superseded` win over expiry). No sweep job, history stays exact.
5. **Summaries are a plain text field.** The platform stores `summary` (nullable) and shows it on the detail page; a "missing summary" filter for `eo:manage` holders flags gaps. Where the text comes from — hand-written, pasted from an LLM — is not the platform's concern. In-platform AI generation is deliberately out of scope (API keys, cost, new architecture).

## Tasks

### Schema

- Migration: `executive_orders` (`eo_number` unique, `title`, `summary`, `status` enum `active|repealed|superseded`, `issued_by` → users, `effective_date`, `expires_at`, `document_id` → documents, `repealed_by_eo_id` / `superseded_by_eo_id` self-FKs, `created_by`, timestamps).
- Migration: seed the `eo:manage` claim definition.
- Shared: status vocabulary + `effectiveEoStatus()` (mirrors `effectiveLicenseStatus`), wire types, zod schemas, audit actions (`eo.issue`, `eo.update`, `eo.status-change` — participant visibility).

### API (`/api/executive-orders`)

- Public list: filter by status (effective, incl. derived `expired`), president, date range; text search over title/number; pagination. Public detail by number with cross-links and the sandboxed PDF URL.
- `GET /next-number` gated `eo:manage`: returns the suggested `max + 1` for the issue form to prefill.
- `POST /` gated `eo:manage`: number (validated positive int; **409 on collision**, not a raw DB error), title, president via the shared user lookup (stub-on-submit), effective date, optional expiry, optional repeals/supersedes target, PDF via the documents pipeline, optional summary.
- `PATCH /:id` gated `eo:manage`: title, summary, dates — audited with before/after.
- `POST /:id/status` gated `eo:manage`: manual correction to repealed/superseded/active with required reason; link-driven flips happen automatically at issue time.
- Profile section: `GET /api/users/:robloxId/executive-orders` — orders issued by that president.

### Frontend

- `/executive-orders` list: EO #, title, president (profile link), effective date, status chips (Active green / Repealed red / Expired warning / Superseded grey), filters, pagination; "Issue order" for claim holders. Nav item.
- `/executive-orders/:eoNumber` detail: header card (number, title, status banner, president, dates), summary card, repeal/supersede cross-links both directions, sandboxed PDF viewer, issue metadata.
- Issue and edit dialogs (claim-gated), status-correction dialog (reason required).
- Profile pages gain an "Executive orders" section.

### Seed

- Extend `db:seed` with a demo chain: an active order, a temporary one past expiry (derives expired), and a repeal pair with cross-links.

_(Migrating the real Notion/Drive archive is a separate, later effort — a shim the team writes against this finished schema, not part of this phase. See the scope note above.)_

## Deliverables

- Full EO lifecycle locally: issue with PDF → appears publicly with filters/detail → repeal via a new order flips the target with cross-links → temporary orders expire by date.
- A clean insert path (explicit numbers/dates accepted) a future backfill shim can target — the shim itself is not built here.

## Acceptance Criteria

- [x] Non-holder cannot issue or edit; `eo:manage` holder can; wiring the presidential group mapping to the claim enables it with no deploy.
- [x] Issuing a repealing order flips the target to `repealed` in the same transaction, cross-links both detail pages, and lands in the audit log.
- [x] `expired` derives from `expires_at` at read time and is never stored; repealed/superseded win over expiry.
- [x] EO numbers are unique; explicit numbers/dates are accepted on insert; new issues auto-suggest the next number; a duplicate number is rejected with a clear 409, not a raw DB error.
- [x] Anonymous users browse the list (all filters) and detail pages with the PDF served from the sandboxed file origin.
- [x] Orders appear on the issuing president's profile page.
