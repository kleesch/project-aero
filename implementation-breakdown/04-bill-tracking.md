# Phase 04 — Bill Tracking

**Depends on:** 03
**Goal:** The full bill lifecycle: submission with generated identifiers, the fixed stage pipeline with manual outcomes, per-member vote recording against synced rosters, versioned PDFs, tags, and session-rollover death.

## Tasks

### Rosters

- Migrations: `congress_rosters`, `roster_rank_rules` (admin-configurable rank→chamber mapping for group 2673501).
- Daily roster-sync job (generic "poll a group, diff membership" module per DESIGN.md future-scope note): upsert members, mark departures inactive, audit the sync summary.
- `POST /api/rosters/resync` gated by `roster:resync`; admin UI for rank rules + roster view.

### Bill core

- Migrations: `bills` (unique `(chamber, session, sequence)`), `bill_versions`, `bill_stage_events`, `bill_votes`, `tags`, `bill_tags`, plus a per-`(chamber, session)` sequence counter table.
- Submission (`bill:submit`): title, chamber (from submitter's roster membership; explicit if in both), initial PDF (documents pipeline), optional tags. Transactionally assigns sequence; computes session via shared math; rejects sequence 100+ with a clear error. Initial status `IN_COMMITTEE`.
- Complete the shared status enum + legal-transition map (structure from phase 01): `IN_COMMITTEE → ORIGIN_FLOOR → OTHER_FLOOR → PRESIDENTIAL → ENACTED | VETOED`; `VETOED → VETO_OVERRIDE → ENACTED_BY_OVERRIDE | VETO_SUSTAINED`; failure states per stage; `DIED_IN_SESSION` from any non-terminal state. Unit-test the map.
- Stage transition endpoint: claim-checked per stage — chamber stages require the matching `bill:vote-update:house|senate` claim (committee + origin floor = origin chamber's claim; other-floor = the other chamber's), `PRESIDENTIAL` sign/veto requires `bill:sign`, override outcome requires the origin chamber's vote-update claim. Outcome is **manually declared**; writes a `bill_stage_events` row; audited.
- New PDF version upload between stages (`bill:submit`, versioned via `bill_versions`).

### Votes

- Record per-member votes on a stage event: bulk entry keyed by roster (yea/nay/abstain/absent), attributed by ROBLOX user id, gated by the stage's chamber claim. Members absent from the roster require explicit confirmation (roster may lag reality).
- Corrections: new row + `superseded_by` on the old; admins may correct any tally; all audited.
- Tallies derived server-side from live (non-superseded) rows.

### Session rollover

- Daily 00:05 ET job + lazy guard on bill mutation: any active bill whose session < current session → `DIED_IN_SESSION`, audited with system actor.

### Tags

- Vocabulary CRUD gated `tags:manage`; applying/removing tags on a bill gated `bill:submit`.

### Frontend

- Public bill list: filter by session, chamber, status, tags; search by display id/title.
- Public bill detail: pipeline visualization (stage history with outcomes/dates), per-stage vote breakdown + tallies, version history with sandboxed PDF viewer, tags.
- Claim-gated: submission form, stage transition dialog, vote entry grid (roster-driven), version upload, sign/veto for the President.

## Deliverables

- End-to-end locally: submit HB/SB → committee → floors → presidential veto → override, with votes at every voting stage, visible publicly.

## Acceptance Criteria

- [ ] Concurrent submissions never collide on `(chamber, session, sequence)` (integration test with parallel requests).
- [ ] Display ids match spec exactly: HB8001, SB3002, HB10022 cases unit-tested.
- [ ] Illegal transitions (e.g. committee → presidential) rejected by the shared map.
- [ ] Sign/veto rejected without `bill:sign` even for chamber-claim holders; chamber claims enforced per the correct chamber.
- [ ] Vote correction supersedes rather than mutates; tally reflects it; audit shows both.
- [ ] Simulated month rollover kills prior-session active bills and leaves terminal/enacted bills untouched.
- [ ] Anonymous users can view bills, votes, and PDFs.
