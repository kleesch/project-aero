/**
 * Judicial records vocabulary: ruling statuses, party sides and types, and
 * the visibility rule for expunged/pardoned records. Defined in exactly one
 * place so backend enforcement and frontend affordance rendering can never
 * drift apart (see DESIGN.md — Judicial).
 */
import { CLAIM_KEYS } from './claims.js';

/**
 * Expungement and pardon are status changes, never deletes: the row and its
 * audit trail persist, and only visibility changes (see DESIGN.md — Judicial).
 *
 * Display semantics: an *expunged* ruling is removed from public view as if
 * it had not happened (court-ordered erasure); a *pardoned* ruling is removed
 * from public view because executive clemency set the consequences aside. The
 * platform treats both identically for visibility — hidden from anonymous
 * users, flagged with their status for privileged viewers — but the banner
 * wording distinguishes them.
 */
export const RULING_STATUSES = {
  ACTIVE: 'active',
  EXPUNGED: 'expunged',
  PARDONED: 'pardoned',
} as const;

export type RulingStatus = (typeof RULING_STATUSES)[keyof typeof RULING_STATUSES];

export const ALL_RULING_STATUSES: readonly RulingStatus[] = Object.values(RULING_STATUSES);

export const RULING_PARTY_SIDES = {
  PLAINTIFF: 'plaintiff',
  DEFENDANT: 'defendant',
} as const;

export type RulingPartySide = (typeof RULING_PARTY_SIDES)[keyof typeof RULING_PARTY_SIDES];

export const ALL_RULING_PARTY_SIDES: readonly RulingPartySide[] = Object.values(RULING_PARTY_SIDES);

export const RULING_PARTY_TYPES = {
  USER: 'user',
  BUSINESS: 'business',
  GOVERNMENT: 'government',
} as const;

export type RulingPartyType = (typeof RULING_PARTY_TYPES)[keyof typeof RULING_PARTY_TYPES];

export const ALL_RULING_PARTY_TYPES: readonly RulingPartyType[] = Object.values(RULING_PARTY_TYPES);

/** The one fixed government party — no user or business reference behind it. */
export const GOVERNMENT_PARTY_LABEL = 'United States government';

/**
 * Claims whose holders still see expunged/pardoned rulings (flagged with a
 * status banner). Everyone else — including the public API — sees only
 * active rulings.
 */
export const RULING_PRIVILEGED_CLAIMS: readonly string[] = [
  CLAIM_KEYS.COURT_SUBMIT,
  CLAIM_KEYS.ADMIN,
];

export function canViewNonActiveRulings(claims: readonly string[]): boolean {
  return RULING_PRIVILEGED_CLAIMS.some((claim) => claims.includes(claim));
}
