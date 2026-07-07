# Phase 05 — Judicial Records

**Depends on:** 03 (parties link to businesses, so business *tables* from 06 must exist or land first — coordinate migrations; the two phases are otherwise parallel)
**Goal:** Judges enter final judgments with linked parties and outcome statuses; Supreme Court appeals; expungement and pardon with preserved audit trails.

## Tasks

### Schema
- Migrations: `rulings` (date, `entered_by`, `status ∈ {active, expunged, pardoned}`, judgment `document_id`), `ruling_parties` (side, `party_type ∈ {user, business, government}`, user/business ref), `ruling_outcomes` vocabulary, `ruling_outcome_links`, `appeals` (verdict `document_id`, `entered_by`, outcome links).

### Ruling entry (`court:submit`)
- Form: ruling date, judgment PDF (documents pipeline), one or more outcomes from the vocabulary, parties on each side.
- **Party lookup endpoint**: typeahead search — users by ROBLOX username/id (platform users first, with a fetch-by-id fallback for users who've never logged in — create a stub `users` row from the ROBLOX API), businesses by name, plus the fixed "United States government" entity. This lookup UX is called out in the spec; make it fast and forgiving.
- Outcomes vocabulary CRUD gated `tags:manage`-style under admin.

### Appeals (`court:appeal-verdict`)
- Any ruling may receive one appeal record: Supreme Court verdict PDF + outcomes. Appeal shown alongside the original on the ruling page.

### Expungement & pardon
- `POST /api/rulings/:id/expunge` gated `court:expunge`; `POST /api/rulings/:id/pardon` gated `court:pardon`. Required reason; audited; **no hard delete** — status + visibility change only.
- Visibility rules: active rulings fully public; expunged/pardoned rulings excluded from public queries, profile pages, and the public API, but visible (with status banner) to holders of `court:submit`/`admin`. Pardoned vs. expunged display semantics documented in code.

### Frontend
- Public court records list: filter by party type, outcome, date; search by party.
- Ruling detail: parties (linked to profiles/business pages), outcomes, sandboxed judgment viewer, appeal section.
- Profile pages and business pages gain a court-record section (respecting visibility).
- Claim-gated: ruling entry form with the lookup experience, appeal entry, expunge/pardon dialogs.

## Deliverables
- Judges enter rulings against real linked entities; appeals, expungement, and pardon all function with correct visibility.

## Acceptance Criteria
- [ ] A ruling's parties resolve to clickable user profiles / business pages; government party renders distinctly.
- [ ] Party lookup finds a user who has never logged in, by ROBLOX id.
- [ ] Expunging hides the ruling from public list, profile, and detail (404 for anonymous) while `court:submit` holders still see it flagged; the underlying rows and audit events are intact.
- [ ] Pardon behaves likewise under `court:pardon`; a judge without the presidential claim cannot pardon and vice versa.
- [ ] Appeal verdict appears alongside the original ruling with its own PDF and outcomes.
