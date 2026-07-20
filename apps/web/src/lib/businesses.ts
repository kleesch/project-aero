import type { BusinessStatus, EffectiveLicenseStatus } from '@aero/shared';

/** Display metadata for the business UI, mirroring lib/bills.ts and lib/courts.ts. */

export const BUSINESS_STATUS_META: Record<BusinessStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'success' },
  inactive: { label: 'Inactive', color: 'grey' },
};

export const LICENSE_STATUS_META: Record<
  EffectiveLicenseStatus,
  { label: string; color: string; icon: string }
> = {
  active: { label: 'Active', color: 'success', icon: 'mdi-license' },
  expired: { label: 'Expired', color: 'warning', icon: 'mdi-clock-alert-outline' },
  revoked: { label: 'Revoked', color: 'error', icon: 'mdi-cancel' },
};
