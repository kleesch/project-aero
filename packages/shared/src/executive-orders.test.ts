import { describe, expect, it } from 'vitest';

import { effectiveEoStatus, EO_STATUSES, formatEoNumber } from './executive-orders.js';

describe('effectiveEoStatus', () => {
  const now = new Date('2026-07-20T12:00:00Z');

  it('is active while unexpired', () => {
    expect(effectiveEoStatus(EO_STATUSES.ACTIVE, null, now)).toBe('active');
    expect(effectiveEoStatus(EO_STATUSES.ACTIVE, '2026-08-01T00:00:00Z', now)).toBe('active');
  });

  it('derives expired once the expiry instant passes', () => {
    expect(effectiveEoStatus(EO_STATUSES.ACTIVE, '2026-07-01T00:00:00Z', now)).toBe('expired');
    expect(effectiveEoStatus(EO_STATUSES.ACTIVE, now, now)).toBe('expired');
  });

  it('repeal and supersession win over expiry', () => {
    expect(effectiveEoStatus(EO_STATUSES.REPEALED, '2026-07-01T00:00:00Z', now)).toBe('repealed');
    expect(effectiveEoStatus(EO_STATUSES.SUPERSEDED, null, now)).toBe('superseded');
  });
});

describe('formatEoNumber', () => {
  it('pads to at least two digits', () => {
    expect(formatEoNumber(1)).toBe('EO #01');
    expect(formatEoNumber(12)).toBe('EO #12');
    expect(formatEoNumber(140)).toBe('EO #140');
  });
});
