import { describe, expect, it } from 'vitest';

import { CLAIM_KEYS } from './claims.js';
import { canViewNonActiveRulings } from './courts.js';

describe('canViewNonActiveRulings', () => {
  it('grants visibility to court:submit and admin holders', () => {
    expect(canViewNonActiveRulings([CLAIM_KEYS.COURT_SUBMIT])).toBe(true);
    expect(canViewNonActiveRulings([CLAIM_KEYS.ADMIN])).toBe(true);
    expect(canViewNonActiveRulings([CLAIM_KEYS.BILL_SUBMIT, CLAIM_KEYS.COURT_SUBMIT])).toBe(true);
  });

  it('denies everyone else — including the other court claims', () => {
    expect(canViewNonActiveRulings([])).toBe(false);
    expect(canViewNonActiveRulings([CLAIM_KEYS.COURT_EXPUNGE])).toBe(false);
    expect(canViewNonActiveRulings([CLAIM_KEYS.COURT_PARDON])).toBe(false);
    expect(canViewNonActiveRulings([CLAIM_KEYS.COURT_APPEAL_VERDICT])).toBe(false);
  });
});
