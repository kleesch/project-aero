# Phase 09 — Future Scope: User Records (Not Scheduled)

**Status:** design notes only. Per PROJECT.md these are explicitly not part of the initial build; this document records how the earlier phases left seams for them, so whoever picks this up starts from the intended shape rather than reverse-engineering it.

## Employment History

- **Mechanism:** the roster-sync module from phase 04 was deliberately built as a generic "poll a ROBLOX group daily, diff membership, record joins/leaves" service. Employment tracking = registering each government agency's group id with that module and persisting the diffs as an `employment_events` timeline per user.
- **New pieces:** an admin-managed `tracked_agencies` table (group id, agency name, active), an `employment_events` table (user, agency, event ∈ {joined, left, rank_changed}, observed_at), and a profile-page timeline section.
- **Backfill:** optional import from existing services; treat as one-off scripts writing through the same audit layer.

## Medals / Honors

- **Mechanism:** the `medals:grant` claim already exists in the shared registry and `claim_definitions`; admins wire it to a group/rank or grant it directly with zero code change (phase 02 UI).
- **New pieces:** `medal_types` vocabulary (admin-managed, same pattern as tags/outcomes/license types), `medal_awards` (user, medal type, granted_by, citation text, awarded_at, revoked_at), profile-page medals section, grant/revoke UI gated by `medals:grant`. All mutations audited; revocation is a status change, not a delete — consistent with the rest of the platform.

## Citizenship

- **Stays external, permanently, by design.** When a citizenship date is needed (profile display or any future feature), query `https://osfusa.azurewebsites.net/api/immigration/{robloxId}/latest` at request time with a short server-side cache. Do not store, mirror, or re-serve citizenship data from this platform, and do not expose it through the public API.

## Ordering Note

Employment history is the natural first pick (it reuses the most existing machinery); medals second (small and self-contained); citizenship needs only a profile-page fetch whenever it becomes wanted.
