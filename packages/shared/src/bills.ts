/**
 * Bill pipeline vocabulary: stages, statuses, vote positions, the legal
 * status-transition map, and the stage→chamber→claim mapping the transition
 * and vote endpoints enforce. Defined in exactly one place so backend
 * enforcement and frontend affordance rendering can never drift apart.
 */
import { CLAIM_KEYS, type ClaimKey } from './claims.js';
import { CHAMBERS, otherChamber, type Chamber } from './congress.js';

/** Voting stages a bill passes through (one `bill_stage_events` row per decision). */
export const BILL_STAGES = {
  COMMITTEE: 'COMMITTEE',
  ORIGIN_FLOOR: 'ORIGIN_FLOOR',
  OTHER_FLOOR: 'OTHER_FLOOR',
  PRESIDENTIAL: 'PRESIDENTIAL',
  VETO_OVERRIDE: 'VETO_OVERRIDE',
} as const;

export type BillStage = (typeof BILL_STAGES)[keyof typeof BILL_STAGES];

export const ALL_BILL_STAGES: readonly BillStage[] = Object.values(BILL_STAGES);

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

export const ALL_BILL_STATUSES: readonly BillStatus[] = Object.values(BILL_STATUSES);

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

/**
 * The stage a bill in a given active status is sitting at — i.e. the stage
 * whose outcome the next transition declares, and whose votes are being
 * gathered. `VETOED` maps to `VETO_OVERRIDE`: the only place a vetoed bill
 * can go is back to Congress for the override. Terminal statuses map to null.
 */
export const STAGE_FOR_STATUS: Readonly<Record<BillStatus, BillStage | null>> = {
  IN_COMMITTEE: BILL_STAGES.COMMITTEE,
  ORIGIN_FLOOR: BILL_STAGES.ORIGIN_FLOOR,
  OTHER_FLOOR: BILL_STAGES.OTHER_FLOOR,
  PRESIDENTIAL: BILL_STAGES.PRESIDENTIAL,
  VETOED: BILL_STAGES.VETO_OVERRIDE,
  VETO_OVERRIDE: BILL_STAGES.VETO_OVERRIDE,
  ENACTED: null,
  ENACTED_BY_OVERRIDE: null,
  VETO_SUSTAINED: null,
  FAILED_COMMITTEE: null,
  FAILED_ORIGIN_FLOOR: null,
  FAILED_OTHER_FLOOR: null,
  DIED_IN_SESSION: null,
};

/**
 * The chamber whose members vote at a stage (and whose roster drives the
 * vote-entry grid): committee and origin floor belong to the origin chamber,
 * the other floor to the other chamber, and a veto override returns to the
 * origin chamber. `PRESIDENTIAL` is the President's alone — no chamber, no
 * per-member votes.
 */
export function chamberForBillStage(stage: BillStage, originChamber: Chamber): Chamber | null {
  switch (stage) {
    case BILL_STAGES.COMMITTEE:
    case BILL_STAGES.ORIGIN_FLOOR:
    case BILL_STAGES.VETO_OVERRIDE:
      return originChamber;
    case BILL_STAGES.OTHER_FLOOR:
      return otherChamber(originChamber);
    case BILL_STAGES.PRESIDENTIAL:
      return null;
  }
}

/** True when per-member votes are recorded at the stage (everything but PRESIDENTIAL). */
export function isVotingStage(stage: BillStage): boolean {
  return stage !== BILL_STAGES.PRESIDENTIAL;
}

/** The vote-update claim covering a chamber's stages. */
export function voteUpdateClaimForChamber(chamber: Chamber): ClaimKey {
  return chamber === CHAMBERS.HOUSE
    ? CLAIM_KEYS.BILL_VOTE_UPDATE_HOUSE
    : CLAIM_KEYS.BILL_VOTE_UPDATE_SENATE;
}

/**
 * The claim required to declare the next outcome for a bill in `fromStatus`:
 * chamber stages need the matching vote-update claim, presidential action
 * needs `bill:sign`, and terminal statuses (null) transition for no one.
 * `DIED_IN_SESSION` is never declared through this map — only the session-
 * rollover job (system actor) sets it.
 */
export function claimForBillTransition(
  fromStatus: BillStatus,
  originChamber: Chamber,
): ClaimKey | null {
  const stage = STAGE_FOR_STATUS[fromStatus];
  if (stage === null) return null;
  if (stage === BILL_STAGES.PRESIDENTIAL) return CLAIM_KEYS.BILL_SIGN;
  // Every non-presidential stage has a chamber.
  return voteUpdateClaimForChamber(chamberForBillStage(stage, originChamber)!);
}

/** Per-member vote positions recorded at every voting stage. */
export const VOTE_POSITIONS = {
  YEA: 'yea',
  NAY: 'nay',
  ABSTAIN: 'abstain',
  ABSENT: 'absent',
} as const;

export type VotePosition = (typeof VOTE_POSITIONS)[keyof typeof VOTE_POSITIONS];

export const ALL_VOTE_POSITIONS: readonly VotePosition[] = Object.values(VOTE_POSITIONS);

/** Live (non-superseded) vote counts for a stage event, derived server-side. */
export type VoteTally = Record<VotePosition, number>;
