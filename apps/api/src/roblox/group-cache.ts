import { eq, lt } from 'drizzle-orm';

import { db } from '../db/client.js';
import { userGroupCache, type CachedGroupRole } from '../db/schema.js';

/**
 * Group-derived claims may lag reality by at most this long (see DESIGN.md —
 * Claims & Permissions → Resolution & freshness). Negative grants bypass this
 * cache entirely.
 */
export const GROUP_CACHE_TTL_MS = 15 * 60 * 1000;

export interface CacheReadResult {
  groups: CachedGroupRole[];
  /** Stale entries are returned so callers can fall back on fetch failure. */
  fresh: boolean;
}

export async function readGroupCache(userId: number): Promise<CacheReadResult | null> {
  const [row] = await db.select().from(userGroupCache).where(eq(userGroupCache.userId, userId));
  if (!row) return null;
  return {
    groups: row.groups,
    fresh: Date.now() - row.fetchedAt.getTime() < GROUP_CACHE_TTL_MS,
  };
}

export async function writeGroupCache(userId: number, groups: CachedGroupRole[]): Promise<void> {
  await db
    .insert(userGroupCache)
    .values({ userId, groups, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: userGroupCache.userId,
      set: { groups, fetchedAt: new Date() },
    });
}

/** Hourly sweep job body. Returns the number of evicted rows. */
export async function sweepGroupCache(): Promise<number> {
  const evicted = await db
    .delete(userGroupCache)
    .where(lt(userGroupCache.fetchedAt, new Date(Date.now() - GROUP_CACHE_TTL_MS)))
    .returning({ userId: userGroupCache.userId });
  return evicted.length;
}
