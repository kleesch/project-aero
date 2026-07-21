import type { EffectiveEoStatus } from '@aero/shared';

/** Display metadata for the Executive Order UI, mirroring lib/courts.ts. */

export const EO_STATUS_META: Record<EffectiveEoStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'success' },
  repealed: { label: 'Repealed', color: 'error' },
  expired: { label: 'Expired', color: 'warning' },
  superseded: { label: 'Superseded', color: 'grey' },
};
