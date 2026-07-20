/**
 * Business registration vocabulary: entity statuses, license statuses, and
 * the expiry rule. Defined in exactly one place so backend enforcement and
 * frontend rendering can never drift apart (see DESIGN.md — Business).
 */

export const BUSINESS_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export type BusinessStatus = (typeof BUSINESS_STATUSES)[keyof typeof BUSINESS_STATUSES];

export const ALL_BUSINESS_STATUSES: readonly BusinessStatus[] = Object.values(BUSINESS_STATUSES);

/**
 * Stored license statuses. `expired` is never stored: a license whose
 * `expires_at` has passed *derives* it at read time (effectiveLicenseStatus),
 * so no sweep job is needed and history stays exact.
 */
export const LICENSE_STATUSES = {
  ACTIVE: 'active',
  REVOKED: 'revoked',
} as const;

export type LicenseStatus = (typeof LICENSE_STATUSES)[keyof typeof LICENSE_STATUSES];

export const ALL_LICENSE_STATUSES: readonly LicenseStatus[] = Object.values(LICENSE_STATUSES);

/** What a license renders as: stored status plus the derived expired state. */
export type EffectiveLicenseStatus = LicenseStatus | 'expired';

/**
 * The status a license presents at `now`: revocation wins over expiry (a
 * revoked license stays revoked even past its expiry date); an active license
 * past its expiry instant is expired.
 */
export function effectiveLicenseStatus(
  status: LicenseStatus,
  expiresAt: Date | string | null,
  now: Date = new Date(),
): EffectiveLicenseStatus {
  if (status === LICENSE_STATUSES.REVOKED) return 'revoked';
  if (expiresAt !== null && new Date(expiresAt).getTime() <= now.getTime()) return 'expired';
  return 'active';
}
