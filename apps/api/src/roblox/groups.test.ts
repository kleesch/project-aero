import { describe, expect, it, vi } from 'vitest';

import type { CachedGroupRole } from '../db/schema.js';
import { getUserGroupRoles, type GroupRolesDeps } from './groups.js';

const USER_ID = 42;

const cachedGroups: CachedGroupRole[] = [
  { groupId: 100, groupName: 'Cached', rank: 10, roleName: 'Member' },
];
const liveGroups: CachedGroupRole[] = [
  { groupId: 100, groupName: 'Live', rank: 20, roleName: 'Officer' },
];

function makeDeps(overrides: Partial<GroupRolesDeps> = {}): GroupRolesDeps {
  return {
    fetchRoles: vi.fn(async () => liveGroups),
    readCache: vi.fn(async () => null),
    writeCache: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('getUserGroupRoles cache behaviour', () => {
  it('serves a fresh cache entry without hitting the Groups API', async () => {
    const deps = makeDeps({
      readCache: vi.fn(async () => ({ groups: cachedGroups, fresh: true })),
    });
    const groups = await getUserGroupRoles(USER_ID, deps);
    expect(groups).toEqual(cachedGroups);
    expect(deps.fetchRoles).not.toHaveBeenCalled();
  });

  it('re-fetches and refreshes the cache once the TTL has expired', async () => {
    const deps = makeDeps({
      readCache: vi.fn(async () => ({ groups: cachedGroups, fresh: false })),
    });
    const groups = await getUserGroupRoles(USER_ID, deps);
    expect(groups).toEqual(liveGroups);
    expect(deps.fetchRoles).toHaveBeenCalledWith(USER_ID);
    expect(deps.writeCache).toHaveBeenCalledWith(USER_ID, liveGroups);
  });

  it('fetches on a cache miss', async () => {
    const deps = makeDeps();
    const groups = await getUserGroupRoles(USER_ID, deps);
    expect(groups).toEqual(liveGroups);
    expect(deps.writeCache).toHaveBeenCalledWith(USER_ID, liveGroups);
  });

  it('falls back to a stale entry when the Groups API is unavailable', async () => {
    const deps = makeDeps({
      readCache: vi.fn(async () => ({ groups: cachedGroups, fresh: false })),
      fetchRoles: vi.fn(async () => {
        throw new Error('Groups API responded 503');
      }),
    });
    const groups = await getUserGroupRoles(USER_ID, deps);
    expect(groups).toEqual(cachedGroups);
  });

  it('fails closed (no groups) when the API is unavailable and nothing is cached', async () => {
    const deps = makeDeps({
      fetchRoles: vi.fn(async () => {
        throw new Error('Groups API responded 503');
      }),
    });
    const groups = await getUserGroupRoles(USER_ID, deps);
    expect(groups).toEqual([]);
  });
});
