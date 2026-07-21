/**
 * Executive Order vocabulary: stored statuses, the derived-status rule, and
 * display-id formatting. Defined in exactly one place so backend enforcement
 * and frontend rendering can never drift apart (see PROJECT.md — Executive
 * Orders).
 */

/**
 * Stored statuses. `expired` is never stored: a temporary order past its
 * `expires_at` *derives* it at read time (effectiveEoStatus), so no sweep job
 * is needed and history stays exact — the same rule business licenses use.
 */
export const EO_STATUSES = {
  ACTIVE: 'active',
  REPEALED: 'repealed',
  SUPERSEDED: 'superseded',
} as const;

export type EoStatus = (typeof EO_STATUSES)[keyof typeof EO_STATUSES];

export const ALL_EO_STATUSES: readonly EoStatus[] = Object.values(EO_STATUSES);

/** What an order renders as: stored status plus the derived expired state. */
export type EffectiveEoStatus = EoStatus | 'expired';

export const ALL_EFFECTIVE_EO_STATUSES: readonly EffectiveEoStatus[] = [
  ...ALL_EO_STATUSES,
  'expired',
];

/**
 * The status an order presents at `now`: repeal/supersession win over expiry
 * (a repealed order stays repealed even past its expiry date); an active
 * order past its expiry instant is expired.
 */
export function effectiveEoStatus(
  status: EoStatus,
  expiresAt: Date | string | null,
  now: Date = new Date(),
): EffectiveEoStatus {
  if (status !== EO_STATUSES.ACTIVE) return status;
  if (expiresAt !== null && new Date(expiresAt).getTime() <= now.getTime()) return 'expired';
  return EO_STATUSES.ACTIVE;
}

/** Formats an EO display id, e.g. `formatEoNumber(12)` → `"EO #12"` (min 2 digits). */
export function formatEoNumber(eoNumber: number): string {
  return `EO #${String(eoNumber).padStart(2, '0')}`;
}
