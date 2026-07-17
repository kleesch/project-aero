import { describe, expect, it, vi } from 'vitest';

import { chambersForRank } from './roster-sync.js';

vi.mock('../db/client.js', () => ({ db: {} }));

const rules = [
  { chamber: 'senate', comparison: '>=', rankValue: 200 },
  { chamber: 'house', comparison: '>=', rankValue: 100 },
  { chamber: 'house', comparison: '==', rankValue: 50 },
] as const;

describe('chambersForRank', () => {
  it('matches by comparison, OR-ing rules per chamber', () => {
    expect(chambersForRank(50, [...rules])).toEqual(['house']);
    expect(chambersForRank(150, [...rules])).toEqual(['house']);
    expect(chambersForRank(49, [...rules])).toEqual([]);
  });

  it('can place a rank in both chambers when rules overlap', () => {
    expect(chambersForRank(255, [...rules]).sort()).toEqual(['house', 'senate']);
  });

  it('matches nobody with no rules — an unconfigured sync is inert', () => {
    expect(chambersForRank(255, [])).toEqual([]);
  });

  it('supports <= rules', () => {
    expect(chambersForRank(10, [{ chamber: 'house', comparison: '<=', rankValue: 20 }])).toEqual([
      'house',
    ]);
    expect(chambersForRank(21, [{ chamber: 'house', comparison: '<=', rankValue: 20 }])).toEqual(
      [],
    );
  });
});
