import { describe, expect, it } from 'vitest';

import {
  BILL_STATUS_TRANSITIONS,
  BILL_STATUSES,
  isLegalBillTransition,
  isTerminalBillStatus,
} from './bills.js';

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
