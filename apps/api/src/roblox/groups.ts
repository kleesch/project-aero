import { setTimeout as sleep } from 'node:timers/promises';

import { z } from 'zod';

import type { CachedGroupRole } from '../db/schema.js';
import { logger } from '../logger.js';
import { readGroupCache, writeGroupCache } from './group-cache.js';

/**
 * ROBLOX Groups API client. Group-derived claims resolve through
 * `getUserGroupRoles`, which serves from `user_group_cache` within its
 * 15-minute TTL and re-fetches after expiry.
 */

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;

const groupRolesResponseSchema = z.object({
  data: z.array(
    z.object({
      group: z.object({ id: z.number(), name: z.string() }),
      role: z.object({ id: z.number(), name: z.string(), rank: z.number() }),
    }),
  ),
});

/** Raw fetch with exponential-backoff retry on 429/5xx/network errors. */
export async function fetchGroupRolesFromRoblox(userId: number): Promise<CachedGroupRole[]> {
  const url = `https://groups.roblox.com/v2/users/${userId}/groups/roles`;

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1) + Math.random() * 250);
    }
    try {
      const response = await fetch(url);
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`Groups API responded ${response.status}`);
        continue;
      }
      if (!response.ok) {
        throw new Error(`Groups API responded ${response.status}`);
      }
      const parsed = groupRolesResponseSchema.parse(await response.json());
      return parsed.data.map((entry) => ({
        groupId: entry.group.id,
        groupName: entry.group.name,
        rank: entry.role.rank,
        roleName: entry.role.name,
      }));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Groups API fetch failed');
}

/** Injectable for tests; production code uses the defaults. */
export interface GroupRolesDeps {
  fetchRoles: (userId: number) => Promise<CachedGroupRole[]>;
  readCache: typeof readGroupCache;
  writeCache: typeof writeGroupCache;
}

const defaultDeps: GroupRolesDeps = {
  fetchRoles: fetchGroupRolesFromRoblox,
  readCache: readGroupCache,
  writeCache: writeGroupCache,
};

/**
 * Cache-aware group role lookup. Serves fresh cache hits directly; otherwise
 * re-fetches and refreshes the cache. If ROBLOX is unreachable, falls back to
 * a stale cache entry (a lost role can then outlive the TTL for as long as
 * the outage — acceptable because negative grants, the hard block, never
 * touch this path) and, with no cache at all, resolves to no groups: group-
 * derived claims fail closed.
 */
export async function getUserGroupRoles(
  userId: number,
  deps: GroupRolesDeps = defaultDeps,
): Promise<CachedGroupRole[]> {
  const cached = await deps.readCache(userId);
  if (cached?.fresh) return cached.groups;

  try {
    const groups = await deps.fetchRoles(userId);
    await deps.writeCache(userId, groups);
    return groups;
  } catch (error) {
    if (cached) {
      logger.warn({ userId, error }, 'Groups API unavailable; serving stale group cache');
      return cached.groups;
    }
    logger.error({ userId, error }, 'Groups API unavailable and no cache; failing closed');
    return [];
  }
}
