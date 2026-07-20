# Phase 06 — Business Registration

**Depends on:** 03 (parallel to 04/05; its tables should land before or with 05's party links)
**Goal:** Registrar-created business entities with single-owner editing, auditable ownership transfer, and license tracking.

## Tasks

### Schema

- Migrations: `businesses` (name, `owner_user_id`, status, `created_by`), `business_ownership_transfers` (append-only), `business_licenses` (type, status, `granted_by`, dates).

### Registration & ownership

- `POST /api/businesses` gated `business:register`: registrar creates the entry and assigns the owner (user lookup reuses the phase-05 typeahead service).
- Edit endpoints: **owner only** (deliberately outside the claims system per spec) — name and detail fields; audited.
- Ownership transfer: initiated by the current owner (or admin, for recovery); writes a transfer row; audited.

### Licenses

- License grant/revoke/update gated `business:license-grant`. The claim exists in the registry now; which group/rank maps to it is wired by admins later via the phase-02 UI — no code change needed then.
- License types as an admin-managed vocabulary (same pattern as tags/outcomes).

### Frontend

- Public business directory: search by name, filter by license status; business detail page (owner, registration status, licenses, court records via phase 05).
- Owner view: edit details, initiate transfer.
- Claim-gated: registrar creation form, license management panel.
- Profile pages gain an owned-businesses section.

## Deliverables

- Full business lifecycle locally: registrar creates → owner edits → licenses granted → ownership transferred, all publicly browsable.

## Acceptance Criteria

- [x] Non-registrar cannot create; owner cannot edit someone else's business; a claim-holder who isn't the owner also cannot edit (claims don't override ownership).
- [x] Ownership transfer preserves full history in `business_ownership_transfers` and the audit log.
- [x] License grant blocked without `business:license-grant`; wiring a group mapping to that claim via the admin UI enables it with no deploy.
- [x] Anonymous users can browse the directory and see license status.
