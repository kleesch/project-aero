import { describe, expect, it } from 'vitest';

import { effectiveLicenseStatus, LICENSE_STATUSES } from './businesses.js';

describe('effectiveLicenseStatus', () => {
  const now = new Date('2026-07-20T12:00:00Z');

  it('is active while unexpired', () => {
    expect(effectiveLicenseStatus(LICENSE_STATUSES.ACTIVE, null, now)).toBe('active');
    expect(effectiveLicenseStatus(LICENSE_STATUSES.ACTIVE, '2026-08-01T00:00:00Z', now)).toBe(
      'active',
    );
  });

  it('derives expired once the expiry instant passes', () => {
    expect(effectiveLicenseStatus(LICENSE_STATUSES.ACTIVE, '2026-07-01T00:00:00Z', now)).toBe(
      'expired',
    );
    // Boundary: exactly at the expiry instant counts as expired.
    expect(effectiveLicenseStatus(LICENSE_STATUSES.ACTIVE, now, now)).toBe('expired');
  });

  it('revocation wins over expiry', () => {
    expect(effectiveLicenseStatus(LICENSE_STATUSES.REVOKED, null, now)).toBe('revoked');
    expect(effectiveLicenseStatus(LICENSE_STATUSES.REVOKED, '2026-07-01T00:00:00Z', now)).toBe(
      'revoked',
    );
  });

  it('accepts Date and ISO-string expiries alike', () => {
    expect(
      effectiveLicenseStatus(LICENSE_STATUSES.ACTIVE, new Date('2026-07-01T00:00:00Z'), now),
    ).toBe('expired');
  });
});
