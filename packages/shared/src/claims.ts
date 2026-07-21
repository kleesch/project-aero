/**
 * Registry of every claim key the platform knows about.
 *
 * This is the single source of truth (see DESIGN.md — Claims & Permissions):
 * the `claim_definitions` table carries descriptions for admins, but the keys
 * themselves live here so backend enforcement and frontend rendering can never
 * drift apart.
 */
export const CLAIM_KEYS = {
  ADMIN: 'admin',
  BILL_SUBMIT: 'bill:submit',
  BILL_VOTE_UPDATE_HOUSE: 'bill:vote-update:house',
  BILL_VOTE_UPDATE_SENATE: 'bill:vote-update:senate',
  BILL_SIGN: 'bill:sign',
  COURT_SUBMIT: 'court:submit',
  COURT_APPEAL_VERDICT: 'court:appeal-verdict',
  COURT_EXPUNGE: 'court:expunge',
  COURT_PARDON: 'court:pardon',
  BUSINESS_REGISTER: 'business:register',
  BUSINESS_LICENSE_GRANT: 'business:license-grant',
  EO_MANAGE: 'eo:manage',
  TAGS_MANAGE: 'tags:manage',
  ROSTER_RESYNC: 'roster:resync',
  CLAIMS_MANAGE: 'claims:manage',
  APIKEY_MANAGE: 'apikey:manage',
  AUDIT_VIEW: 'audit:view',
  /** Reserved for future user-records scope (phase 09). */
  MEDALS_GRANT: 'medals:grant',
} as const;

export type ClaimKey = (typeof CLAIM_KEYS)[keyof typeof CLAIM_KEYS];

export const ALL_CLAIM_KEYS: readonly ClaimKey[] = Object.values(CLAIM_KEYS);

/**
 * Claims implicitly satisfied by the `admin` claim (see DESIGN.md — Seeding).
 */
export const ADMIN_IMPLIED_CLAIMS: readonly ClaimKey[] = [
  CLAIM_KEYS.CLAIMS_MANAGE,
  CLAIM_KEYS.TAGS_MANAGE,
  CLAIM_KEYS.APIKEY_MANAGE,
  CLAIM_KEYS.AUDIT_VIEW,
];

export function isClaimKey(value: string): value is ClaimKey {
  return (ALL_CLAIM_KEYS as readonly string[]).includes(value);
}
