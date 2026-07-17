import { describe, expect, it } from 'vitest';

import {
  BILL_STAGES,
  BILL_STATUS_TRANSITIONS,
  BILL_STATUSES,
  chamberForBillStage,
  claimForBillTransition,
  isLegalBillTransition,
  isTerminalBillStatus,
  isVotingStage,
  STAGE_FOR_STATUS,
} from './bills.js';
import { CLAIM_KEYS } from './claims.js';

describe('BILL_STATUS_TRANSITIONS', () => {
  it('covers every status', () => {
    for (const status of Object.values(BILL_STATUSES)) {
      expect(BILL_STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('only ever transitions to known statuses', () => {
    const known = new Set(Object.values(BILL_STATUSES));
    for (const targets of Object.values(BILL_STATUS_TRANSITIONS)) {
      for (const target of targets) {
        expect(known.has(target)).toBe(true);
      }
    }
  });

  it('lets every non-terminal status die at session rollover', () => {
    for (const status of Object.values(BILL_STATUSES)) {
      if (!isTerminalBillStatus(status)) {
        expect(isLegalBillTransition(status, BILL_STATUSES.DIED_IN_SESSION)).toBe(true);
      }
    }
  });

  it('treats enacted, failed, and died statuses as terminal', () => {
    expect(isTerminalBillStatus(BILL_STATUSES.ENACTED)).toBe(true);
    expect(isTerminalBillStatus(BILL_STATUSES.ENACTED_BY_OVERRIDE)).toBe(true);
    expect(isTerminalBillStatus(BILL_STATUSES.VETO_SUSTAINED)).toBe(true);
    expect(isTerminalBillStatus(BILL_STATUSES.DIED_IN_SESSION)).toBe(true);
    expect(isTerminalBillStatus(BILL_STATUSES.IN_COMMITTEE)).toBe(false);
    expect(isTerminalBillStatus(BILL_STATUSES.VETOED)).toBe(false);
  });

  it('follows the designed pipeline', () => {
    expect(isLegalBillTransition('IN_COMMITTEE', 'ORIGIN_FLOOR')).toBe(true);
    expect(isLegalBillTransition('ORIGIN_FLOOR', 'OTHER_FLOOR')).toBe(true);
    expect(isLegalBillTransition('OTHER_FLOOR', 'PRESIDENTIAL')).toBe(true);
    expect(isLegalBillTransition('PRESIDENTIAL', 'ENACTED')).toBe(true);
    expect(isLegalBillTransition('PRESIDENTIAL', 'VETOED')).toBe(true);
    expect(isLegalBillTransition('VETOED', 'VETO_OVERRIDE')).toBe(true);
    expect(isLegalBillTransition('VETO_OVERRIDE', 'ENACTED_BY_OVERRIDE')).toBe(true);
    expect(isLegalBillTransition('VETO_OVERRIDE', 'VETO_SUSTAINED')).toBe(true);
    // No skipping stages or resurrecting terminal bills.
    expect(isLegalBillTransition('IN_COMMITTEE', 'PRESIDENTIAL')).toBe(false);
    expect(isLegalBillTransition('ENACTED', 'IN_COMMITTEE')).toBe(false);
    expect(isLegalBillTransition('DIED_IN_SESSION', 'IN_COMMITTEE')).toBe(false);
  });
});

describe('STAGE_FOR_STATUS', () => {
  it('maps every active status to the stage awaiting its outcome', () => {
    expect(STAGE_FOR_STATUS.IN_COMMITTEE).toBe(BILL_STAGES.COMMITTEE);
    expect(STAGE_FOR_STATUS.ORIGIN_FLOOR).toBe(BILL_STAGES.ORIGIN_FLOOR);
    expect(STAGE_FOR_STATUS.OTHER_FLOOR).toBe(BILL_STAGES.OTHER_FLOOR);
    expect(STAGE_FOR_STATUS.PRESIDENTIAL).toBe(BILL_STAGES.PRESIDENTIAL);
    // A vetoed bill's only path forward is the override in Congress.
    expect(STAGE_FOR_STATUS.VETOED).toBe(BILL_STAGES.VETO_OVERRIDE);
    expect(STAGE_FOR_STATUS.VETO_OVERRIDE).toBe(BILL_STAGES.VETO_OVERRIDE);
  });

  it('maps exactly the terminal statuses to null', () => {
    for (const status of Object.values(BILL_STATUSES)) {
      expect(STAGE_FOR_STATUS[status] === null).toBe(isTerminalBillStatus(status));
    }
  });
});

describe('chamberForBillStage', () => {
  it('assigns committee, origin floor, and override to the origin chamber', () => {
    for (const stage of [
      BILL_STAGES.COMMITTEE,
      BILL_STAGES.ORIGIN_FLOOR,
      BILL_STAGES.VETO_OVERRIDE,
    ]) {
      expect(chamberForBillStage(stage, 'house')).toBe('house');
      expect(chamberForBillStage(stage, 'senate')).toBe('senate');
    }
  });

  it('assigns the other floor to the other chamber', () => {
    expect(chamberForBillStage(BILL_STAGES.OTHER_FLOOR, 'house')).toBe('senate');
    expect(chamberForBillStage(BILL_STAGES.OTHER_FLOOR, 'senate')).toBe('house');
  });

  it('gives the presidential stage no chamber and no votes', () => {
    expect(chamberForBillStage(BILL_STAGES.PRESIDENTIAL, 'house')).toBeNull();
    expect(isVotingStage(BILL_STAGES.PRESIDENTIAL)).toBe(false);
    expect(isVotingStage(BILL_STAGES.COMMITTEE)).toBe(true);
    expect(isVotingStage(BILL_STAGES.VETO_OVERRIDE)).toBe(true);
  });
});

describe('claimForBillTransition', () => {
  it('requires the origin chamber claim through committee and origin floor', () => {
    expect(claimForBillTransition('IN_COMMITTEE', 'house')).toBe(CLAIM_KEYS.BILL_VOTE_UPDATE_HOUSE);
    expect(claimForBillTransition('ORIGIN_FLOOR', 'house')).toBe(CLAIM_KEYS.BILL_VOTE_UPDATE_HOUSE);
    expect(claimForBillTransition('IN_COMMITTEE', 'senate')).toBe(
      CLAIM_KEYS.BILL_VOTE_UPDATE_SENATE,
    );
  });

  it('requires the other chamber claim on the other floor', () => {
    expect(claimForBillTransition('OTHER_FLOOR', 'house')).toBe(CLAIM_KEYS.BILL_VOTE_UPDATE_SENATE);
    expect(claimForBillTransition('OTHER_FLOOR', 'senate')).toBe(CLAIM_KEYS.BILL_VOTE_UPDATE_HOUSE);
  });

  it('reserves presidential action for bill:sign — never a chamber claim', () => {
    expect(claimForBillTransition('PRESIDENTIAL', 'house')).toBe(CLAIM_KEYS.BILL_SIGN);
    expect(claimForBillTransition('PRESIDENTIAL', 'senate')).toBe(CLAIM_KEYS.BILL_SIGN);
  });

  it('sends the veto override back to the origin chamber', () => {
    expect(claimForBillTransition('VETOED', 'house')).toBe(CLAIM_KEYS.BILL_VOTE_UPDATE_HOUSE);
    expect(claimForBillTransition('VETO_OVERRIDE', 'house')).toBe(
      CLAIM_KEYS.BILL_VOTE_UPDATE_HOUSE,
    );
    expect(claimForBillTransition('VETOED', 'senate')).toBe(CLAIM_KEYS.BILL_VOTE_UPDATE_SENATE);
  });

  it('lets no one transition a terminal bill', () => {
    for (const status of Object.values(BILL_STATUSES)) {
      if (isTerminalBillStatus(status)) {
        expect(claimForBillTransition(status, 'house')).toBeNull();
      }
    }
  });
});
