/**
 * Bill pipeline vocabulary: stages, statuses, vote positions, and the legal
 * status-transition map. Enforcement is wired up in phase 04; the shapes and
 * contents live here so the pipeline is defined in exactly one place.
 */

/** Voting stages a bill passes through (one `bill_stage_events` row per decision). */
export const BILL_STAGES = {
  COMMITTEE: 'COMMITTEE',
  ORIGIN_FLOOR: 'ORIGIN_FLOOR',
  OTHER_FLOOR: 'OTHER_FLOOR',
  PRESIDENTIAL: 'PRESIDENTIAL',
  VETO_OVERRIDE: 'VETO_OVERRIDE',
} as const;

export type BillStage = (typeof BILL_STAGES)[keyof typeof BILL_STAGES];

export const BILL_STATUSES = {
  IN_COMMITTEE: 'IN_COMMITTEE',
  ORIGIN_FLOOR: 'ORIGIN_FLOOR',
  OTHER_FLOOR: 'OTHER_FLOOR',
  PRESIDENTIAL: 'PRESIDENTIAL',
  VETOED: 'VETOED',
  VETO_OVERRIDE: 'VETO_OVERRIDE',
  ENACTED: 'ENACTED',
  ENACTED_BY_OVERRIDE: 'ENACTED_BY_OVERRIDE',
  VETO_SUSTAINED: 'VETO_SUSTAINED',
  FAILED_COMMITTEE: 'FAILED_COMMITTEE',
  FAILED_ORIGIN_FLOOR: 'FAILED_ORIGIN_FLOOR',
  FAILED_OTHER_FLOOR: 'FAILED_OTHER_FLOOR',
  DIED_IN_SESSION: 'DIED_IN_SESSION',
} as const;

export type BillStatus = (typeof BILL_STATUSES)[keyof typeof BILL_STATUSES];

/**
 * Legal transitions between bill statuses. A status mapping to an empty list
 * is terminal. Any still-active bill dies (`DIED_IN_SESSION`) when the
 * Congress session rolls over, so every non-terminal status includes it.
 */
export const BILL_STATUS_TRANSITIONS: Readonly<Record<BillStatus, readonly BillStatus[]>> = {
  IN_COMMITTEE: ['ORIGIN_FLOOR', 'FAILED_COMMITTEE', 'DIED_IN_SESSION'],
  ORIGIN_FLOOR: ['OTHER_FLOOR', 'FAILED_ORIGIN_FLOOR', 'DIED_IN_SESSION'],
  OTHER_FLOOR: ['PRESIDENTIAL', 'FAILED_OTHER_FLOOR', 'DIED_IN_SESSION'],
  PRESIDENTIAL: ['ENACTED', 'VETOED', 'DIED_IN_SESSION'],
  VETOED: ['VETO_OVERRIDE', 'DIED_IN_SESSION'],
  VETO_OVERRIDE: ['ENACTED_BY_OVERRIDE', 'VETO_SUSTAINED', 'DIED_IN_SESSION'],
  ENACTED: [],
  ENACTED_BY_OVERRIDE: [],
  VETO_SUSTAINED: [],
  FAILED_COMMITTEE: [],
  FAILED_ORIGIN_FLOOR: [],
  FAILED_OTHER_FLOOR: [],
  DIED_IN_SESSION: [],
};

export function isTerminalBillStatus(status: BillStatus): boolean {
  return BILL_STATUS_TRANSITIONS[status].length === 0;
}

export function isLegalBillTransition(from: BillStatus, to: BillStatus): boolean {
  return BILL_STATUS_TRANSITIONS[from].includes(to);
}

/** Per-member vote positions recorded at every voting stage. */
export const VOTE_POSITIONS = {
  YEA: 'yea',
  NAY: 'nay',
  ABSTAIN: 'abstain',
  ABSENT: 'absent',
} as const;

export type VotePosition = (typeof VOTE_POSITIONS)[keyof typeof VOTE_POSITIONS];
