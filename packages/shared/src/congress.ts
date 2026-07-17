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

/** The ROBLOX Congress group the House/Senate rosters sync from. */
export const CONGRESS_GROUP_ID = 2673501;

/** Chambers as stored on rosters. */
export const CHAMBERS = {
  HOUSE: 'house',
  SENATE: 'senate',
} as const;

export type Chamber = (typeof CHAMBERS)[keyof typeof CHAMBERS];

export const ALL_CHAMBERS: readonly Chamber[] = Object.values(CHAMBERS);

/** Single-letter chamber codes as stored on bills and used in display ids. */
export const CHAMBER_CODES = {
  house: 'H',
  senate: 'S',
} as const;

export type ChamberCode = (typeof CHAMBER_CODES)[Chamber];

/** Inverse of CHAMBER_CODES: the roster chamber a bill code stands for. */
export const CHAMBER_FOR_CODE: Readonly<Record<ChamberCode, Chamber>> = {
  H: CHAMBERS.HOUSE,
  S: CHAMBERS.SENATE,
};

/** The chamber a bill did not originate in (floor two, and who votes there). */
export function otherChamber(chamber: Chamber): Chamber {
  return chamber === CHAMBERS.HOUSE ? CHAMBERS.SENATE : CHAMBERS.HOUSE;
}

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

export interface ParsedBillId {
  chamber: ChamberCode;
  session: number;
  sequence: number;
}

/**
 * Parses a display id back into its parts (`"HB10022"` → H, session 100,
 * sequence 22), or null when the string is not a well-formed display id. The
 * final two digits are always the sequence (per PROJECT.md a session never
 * produces more than 99 bills per chamber); everything before them is the
 * session. Case-insensitive so pasted/typed ids match.
 */
export function parseBillId(displayId: string): ParsedBillId | null {
  const match = /^(H|S)B(\d+)(\d{2})$/i.exec(displayId.trim());
  if (!match) return null;
  const chamber = match[1]!.toUpperCase() as ChamberCode;
  const session = Number(match[2]);
  const sequence = Number(match[3]);
  if (session < 1 || sequence < 1) return null;
  return { chamber, session, sequence };
}
