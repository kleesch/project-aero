# Phase 02 — Auth, Sessions & Claims

**Depends on:** 01
**Goal:** Users log in with ROBLOX; the full claims system (group mappings, direct grants, negative claims) resolves and enforces permissions; admins manage claims in-platform.

## Tasks

### ROBLOX OAuth
- Register the OAuth app on the ROBLOX Creator Hub (manual step — document in README); scopes `openid profile`.
- `GET /auth/login` → authorize redirect with PKCE + `state`; `GET /auth/callback` → code exchange, userinfo fetch, upsert into `users` (roblox id PK, username/display name/avatar snapshots), session creation.
- `POST /auth/logout` destroys the session.
- Session storage: `sessions` table, httpOnly `SameSite=Lax` `Secure` cookie carrying only the session id; sliding expiry; hourly cleanup job.

### Claims schema & resolution
- Migrations: `claim_definitions`, `group_claim_mappings`, `direct_claim_grants`, `user_group_cache`.
- Seed migration: claim definitions from the shared registry; direct `admin` grant to ROBLOX user `9725456`.
- ROBLOX Groups API client (`GET /v2/users/{id}/groups/roles`) with retry/backoff; results cached in `user_group_cache` with 15-minute TTL.
- Claim resolution service: `(group-derived ∪ positive grants) − negative grants`. **Negative grants read live, never cached.** Unit-test the merge, TTL expiry, and negative-wins semantics thoroughly — this is the security core of the platform.
- `requireAuth` and `requireClaim(key)` Express middleware; `admin` implies the management claims per DESIGN.md.
- `GET /api/me` → identity + merged claim set.

### Claim management API + UI
- CRUD for group mappings (`claims:manage`): claim key, group id, comparison (>=, ==, <=), rank value.
- Direct grants: create/revoke positive and negative grants with a required reason field.
- Admin UI (Vuetify): claims list with per-claim mappings and grants; user lookup (by ROBLOX id/username) showing a user's resolved claims and their sources (which mapping / which grant) — this "why does this user have this claim" view is essential for debugging permissions.

### Frontend integration
- TanStack Query wrapper around `/api/me`; a `useClaims()` composable + `v-if` style helpers to gate UI affordances.
- Login/logout flow in the app bar; anonymous browsing untouched.

## Deliverables
- Working ROBLOX login end-to-end locally.
- Admin (user 9725456) can create a group mapping, grant/revoke direct and negative claims, and see resolved claims for any user.

## Acceptance Criteria
- [ ] OAuth round trip works locally; session survives reload; logout revokes server-side.
- [ ] Claim resolution unit tests cover: group mapping comparisons, OR'd mappings, positive grant, negative grant overriding a group claim **immediately** despite warm cache, TTL expiry re-fetch.
- [ ] A gated test route returns 401 anonymous, 403 without claim, 200 with claim; still 403 within 15 minutes of losing a group role only until TTL expiry, but **instantly** 403 after a negative grant.
- [ ] Admin UI can answer "why does user X have claim Y" without reading the database.
