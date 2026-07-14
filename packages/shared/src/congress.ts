/**
 * Congress session math and bill display-id formatting.
 *
 * The session number is computed, never manually advanced: one session per
 * calendar month in `America/New_York`, anchored at July 2026 = session 84
 * (see DESIGN.md — Bills).
 */

export const CONGRESS_TIME_ZONE = 'America/New_York';

const EPOCH_YEAR = 2026;
const EPOCH_MONTH = 7; // July
const EPOCH_SESSION = 84;

// A UTC instant near midnight can fall in a different calendar month in ET
// than in UTC, so the month must be read through the IANA time zone database.
const easternCalendarMonth = new Intl.DateTimeFormat('en-US', {
  timeZone: CONGRESS_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
});

/** Returns the Congress session number in effect at the given instant. */
export function sessionForDate(date: Date): number {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('sessionForDate: invalid date');
  }
  let year: number | undefined;
  let month: number | undefined;
  for (const part of easternCalendarMonth.formatToParts(date)) {
    if (part.type === 'year') year = Number(part.value);
    if (part.type === 'month') month = Number(part.value);
  }
  if (year === undefined || month === undefined) {
    throw new Error(`sessionForDate: could not resolve ${CONGRESS_TIME_ZONE} calendar month`);
  }
  return EPOCH_SESSION + (year - EPOCH_YEAR) * 12 + (month - EPOCH_MONTH);
}

/** Chambers as stored on rosters. */
export const CHAMBERS = {
  HOUSE: 'house',
  SENATE: 'senate',
} as const;

export type Chamber = (typeof CHAMBERS)[keyof typeof CHAMBERS];

/** Single-letter chamber codes as stored on bills and used in display ids. */
export const CHAMBER_CODES = {
  house: 'H',
  senate: 'S',
} as const;

export type ChamberCode = (typeof CHAMBER_CODES)[Chamber];

/**
 * Formats a bill display id, e.g. `formatBillId('H', 84, 1)` → `"HB8401"`.
 * The display id is derived from `(chamber, session, sequence)`; it is never
 * a bill's stored identity.
 */
export function formatBillId(chamber: ChamberCode, session: number, sequence: number): string {
  if (chamber !== 'H' && chamber !== 'S') {
    throw new RangeError(
      `formatBillId: chamber must be "H" or "S", got ${JSON.stringify(chamber)}`,
    );
  }
  if (!Number.isInteger(session) || session < 1) {
    throw new RangeError(`formatBillId: session must be a positive integer, got ${session}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 99) {
    throw new RangeError(`formatBillId: sequence must be an integer in 1–99, got ${sequence}`);
  }
  return `${chamber}B${session}${String(sequence).padStart(2, '0')}`;
}
