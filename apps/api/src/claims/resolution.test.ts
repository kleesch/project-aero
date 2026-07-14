import { CLAIM_KEYS } from '@aero/shared';
import { describe, expect, it } from 'vitest';

import type { CachedGroupRole } from '../db/schema.js';
import {
  resolveUserClaims,
  type GrantRow,
  type MappingRow,
  type ResolutionDeps,
} from './resolution.js';

const USER_ID = 42;

function group(groupId: number, rank: number): CachedGroupRole {
  return { groupId, groupName: `Group ${groupId}`, rank, roleName: `Rank ${rank}` };
}

let nextId = 1;

function mapping(
  claimKey: string,
  groupId: number,
  comparison: '>=' | '==' | '<=',
  rankValue: number,
): MappingRow {
  return {
    id: nextId++,
    claimKey,
    groupId,
    comparison,
    rankValue,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function grant(claimKey: string, isNegative = false): GrantRow {
  return {
    id: nextId++,
    userId: USER_ID,
    claimKey,
    isNegative,
    reason: 'test',
    grantedBy: null,
    grantedAt: new Date(),
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
  };
}

function deps(overrides: {
  groups?: CachedGroupRole[];
  mappings?: MappingRow[];
  grants?: GrantRow[];
}): ResolutionDeps {
  return {
    getGroupRoles: async () => overrides.groups ?? [],
    listMappings: async () => overrides.mappings ?? [],
    listActiveGrants: async () => overrides.grants ?? [],
  };
}

describe('group mapping comparisons', () => {
  it.each([
    ['>=', 5, 5, true],
    ['>=', 6, 5, true],
    ['>=', 4, 5, false],
    ['==', 5, 5, true],
    ['==', 6, 5, false],
    ['<=', 5, 5, true],
    ['<=', 4, 5, true],
    ['<=', 6, 5, false],
  ] as const)('rank %s %d vs %d → %s', async (comparison, userRank, rankValue, holds) => {
    const result = await resolveUserClaims(
      USER_ID,
      deps({
        groups: [group(100, userRank)],
        mappings: [mapping(CLAIM_KEYS.BILL_SUBMIT, 100, comparison, rankValue)],
      }),
    );
    expect(result.claims.includes(CLAIM_KEYS.BILL_SUBMIT)).toBe(holds);
  });

  it('never matches a user who is not in the mapped group, even for <=', async () => {
    const result = await resolveUserClaims(
      USER_ID,
      deps({
        groups: [],
        mappings: [mapping(CLAIM_KEYS.BILL_SUBMIT, 100, '<=', 255)],
      }),
    );
    expect(result.claims).toEqual([]);
  });

  it("OR's multiple mappings for the same claim", async () => {
    const mappings = [
      mapping(CLAIM_KEYS.COURT_SUBMIT, 100, '>=', 200), // not satisfied (rank 10)
      mapping(CLAIM_KEYS.COURT_SUBMIT, 200, '>=', 5), // satisfied
    ];
    const result = await resolveUserClaims(
      USER_ID,
      deps({ groups: [group(100, 10), group(200, 10)], mappings }),
    );
    expect(result.claims).toContain(CLAIM_KEYS.COURT_SUBMIT);
    // Only the satisfied mapping appears as a source.
    const resolved = result.resolved.find((entry) => entry.key === CLAIM_KEYS.COURT_SUBMIT);
    expect(resolved?.sources).toHaveLength(1);
    expect(resolved?.sources[0]).toMatchObject({ type: 'group-mapping', groupId: 200 });
  });
});

describe('direct grants', () => {
  it('adds claims from positive grants', async () => {
    const result = await resolveUserClaims(
      USER_ID,
      deps({ grants: [grant(CLAIM_KEYS.TAGS_MANAGE)] }),
    );
    expect(result.claims).toContain(CLAIM_KEYS.TAGS_MANAGE);
  });

  it('negative grant overrides a group-derived claim immediately, despite a warm cache', async () => {
    // The group cache still says the user holds the qualifying rank — the
    // negative grant (always read live) must win anyway.
    const result = await resolveUserClaims(
      USER_ID,
      deps({
        groups: [group(100, 50)],
        mappings: [mapping(CLAIM_KEYS.BILL_SIGN, 100, '>=', 10)],
        grants: [grant(CLAIM_KEYS.BILL_SIGN, true)],
      }),
    );
    expect(result.claims).not.toContain(CLAIM_KEYS.BILL_SIGN);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0]).toMatchObject({ key: CLAIM_KEYS.BILL_SIGN });
    expect(result.blocked[0]?.overriddenSources).toHaveLength(1);
  });

  it('negative grant overrides a positive grant for the same claim', async () => {
    const result = await resolveUserClaims(
      USER_ID,
      deps({ grants: [grant(CLAIM_KEYS.TAGS_MANAGE), grant(CLAIM_KEYS.TAGS_MANAGE, true)] }),
    );
    expect(result.claims).not.toContain(CLAIM_KEYS.TAGS_MANAGE);
  });
});

describe('admin implication', () => {
  it('admin implies the management claims', async () => {
    const result = await resolveUserClaims(USER_ID, deps({ grants: [grant(CLAIM_KEYS.ADMIN)] }));
    expect(result.claims).toEqual(
      expect.arrayContaining([
        CLAIM_KEYS.ADMIN,
        CLAIM_KEYS.CLAIMS_MANAGE,
        CLAIM_KEYS.TAGS_MANAGE,
        CLAIM_KEYS.APIKEY_MANAGE,
        CLAIM_KEYS.AUDIT_VIEW,
      ]),
    );
    const implied = result.resolved.find((entry) => entry.key === CLAIM_KEYS.CLAIMS_MANAGE);
    expect(implied?.sources).toEqual([{ type: 'admin-implied' }]);
  });

  it('a negative grant on an implied claim beats the admin implication', async () => {
    const result = await resolveUserClaims(
      USER_ID,
      deps({ grants: [grant(CLAIM_KEYS.ADMIN), grant(CLAIM_KEYS.AUDIT_VIEW, true)] }),
    );
    expect(result.claims).toContain(CLAIM_KEYS.ADMIN);
    expect(result.claims).not.toContain(CLAIM_KEYS.AUDIT_VIEW);
  });

  it('a blocked admin claim implies nothing', async () => {
    const result = await resolveUserClaims(
      USER_ID,
      deps({ grants: [grant(CLAIM_KEYS.ADMIN), grant(CLAIM_KEYS.ADMIN, true)] }),
    );
    expect(result.claims).toEqual([]);
  });
});
