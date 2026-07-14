import { describe, expect, it } from 'vitest';

import { formatBillId, sessionForDate } from './congress.js';

describe('sessionForDate', () => {
  it('anchors July 2026 to session 84', () => {
    expect(sessionForDate(new Date('2026-07-15T12:00:00Z'))).toBe(84);
  });

  it('advances one session per calendar month', () => {
    expect(sessionForDate(new Date('2026-08-10T12:00:00Z'))).toBe(85);
    expect(sessionForDate(new Date('2026-06-10T12:00:00Z'))).toBe(83);
    expect(sessionForDate(new Date('2027-07-10T12:00:00Z'))).toBe(96);
  });

  it('uses the America/New_York calendar month, not UTC, at month boundaries', () => {
    // 2026-08-01T03:59Z is already August in UTC but still 23:59 on July 31 in EDT.
    expect(sessionForDate(new Date('2026-08-01T03:59:00Z'))).toBe(84);
    // Two minutes later it is 00:01 on August 1 in EDT — adjacent session.
    expect(sessionForDate(new Date('2026-08-01T04:01:00Z'))).toBe(85);
  });

  it('handles the October→November boundary on the 2026 DST fall-back day', () => {
    // DST ends 2026-11-01 at 02:00 EDT, so midnight on the boundary is still UTC-4.
    expect(sessionForDate(new Date('2026-11-01T03:59:00Z'))).toBe(87); // Oct 31, 23:59 EDT
    expect(sessionForDate(new Date('2026-11-01T04:01:00Z'))).toBe(88); // Nov 1, 00:01 EDT
  });

  it('handles the year boundary under EST (UTC-5)', () => {
    expect(sessionForDate(new Date('2027-01-01T04:59:00Z'))).toBe(89); // Dec 31, 23:59 EST
    expect(sessionForDate(new Date('2027-01-01T05:01:00Z'))).toBe(90); // Jan 1, 00:01 EST
  });

  it('rejects invalid dates', () => {
    expect(() => sessionForDate(new Date('not a date'))).toThrow(RangeError);
  });
});

describe('formatBillId', () => {
  it('formats chamber + session + zero-padded sequence', () => {
    expect(formatBillId('H', 84, 1)).toBe('HB8401');
    expect(formatBillId('S', 84, 12)).toBe('SB8412');
    expect(formatBillId('H', 99, 99)).toBe('HB9999');
    expect(formatBillId('S', 100, 5)).toBe('SB10005');
  });

  it('rejects sequences outside 1–99', () => {
    expect(() => formatBillId('H', 84, 0)).toThrow(RangeError);
    expect(() => formatBillId('H', 84, 100)).toThrow(RangeError);
    expect(() => formatBillId('H', 84, 1.5)).toThrow(RangeError);
  });

  it('rejects non-positive or fractional sessions', () => {
    expect(() => formatBillId('H', 0, 1)).toThrow(RangeError);
    expect(() => formatBillId('H', 84.5, 1)).toThrow(RangeError);
  });

  it('rejects unknown chamber codes', () => {
    expect(() => formatBillId('X' as never, 84, 1)).toThrow(RangeError);
  });
});
