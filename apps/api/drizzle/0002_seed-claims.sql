-- Seed migration (see DESIGN.md — Claims & Permissions → Seeding).
--
-- Claim keys mirror the registry in packages/shared/src/claims.ts — the
-- single source of truth. When a key is added there, a follow-up migration
-- must insert its definition; keep the two in sync.

INSERT INTO "claim_definitions" ("key", "description") VALUES
  ('admin', 'Full platform administration. Implies claims:manage, tags:manage, apikey:manage, and audit:view.'),
  ('bill:submit', 'Submit bills and apply tags to them.'),
  ('bill:vote-update:house', 'Record per-member votes and stage outcomes for House stages.'),
  ('bill:vote-update:senate', 'Record per-member votes and stage outcomes for Senate stages.'),
  ('bill:sign', 'Record presidential action on bills (sign / veto).'),
  ('court:submit', 'Enter court rulings and judgment documents.'),
  ('court:appeal-verdict', 'Enter Supreme Court appeal verdicts.'),
  ('court:expunge', 'Expunge court rulings from public visibility.'),
  ('court:pardon', 'Pardon court rulings.'),
  ('business:register', 'Create business registrations and assign owners.'),
  ('business:license-grant', 'Grant and revoke business licenses.'),
  ('tags:manage', 'Manage the bill tag vocabulary.'),
  ('roster:resync', 'Force an immediate congressional roster resync.'),
  ('claims:manage', 'Manage group claim mappings and direct claim grants.'),
  ('apikey:manage', 'Issue and revoke external API keys.'),
  ('audit:view', 'View sensitive audit log categories.'),
  ('medals:grant', 'Reserved for the future user-records scope: grant medals.')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

-- Initial platform administrator: ROBLOX user 9725456. The users row is a
-- placeholder; username/display name/avatar snapshots refresh at first login.
INSERT INTO "users" ("roblox_user_id", "username")
VALUES (9725456, 'user-9725456')
ON CONFLICT ("roblox_user_id") DO NOTHING;
--> statement-breakpoint

INSERT INTO "direct_claim_grants" ("user_id", "claim_key", "is_negative", "reason", "granted_by")
SELECT 9725456, 'admin', false, 'Initial platform administrator (seed migration).', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "direct_claim_grants"
  WHERE "user_id" = 9725456 AND "claim_key" = 'admin' AND "is_negative" = false AND "revoked_at" IS NULL
);
