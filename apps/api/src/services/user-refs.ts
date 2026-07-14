import type { UserRef } from '@aero/shared';
import { inArray } from 'drizzle-orm';

import { db } from '../db/client.js';
import { users } from '../db/schema.js';

/**
 * Batch id → UserRef hydration, called at the serialization boundary of any
 * response that mentions people (grantors, audit actors, uploaders, …).
 * Every referenced id has a users row by foreign key, so this is one local
 * query per response — never a ROBLOX API call, and O(1) queries regardless
 * of row count. Names go stale only until the user's next login snapshot.
 */
export interface UserRefLookup {
  (id: number): UserRef;
  /** Null in, null out — null actors mean the system acted. */
  (id: number | null | undefined): UserRef | null;
}

export async function loadUserRefs(
  ids: Iterable<number | null | undefined>,
): Promise<UserRefLookup> {
  const wanted = [...new Set(ids)].filter((id): id is number => typeof id === 'number');
  const rows = wanted.length
    ? await db
        .select({
          robloxUserId: users.robloxUserId,
          username: users.username,
          displayName: users.displayName,
        })
        .from(users)
        .where(inArray(users.robloxUserId, wanted))
    : [];
  const byId = new Map<number, UserRef>(rows.map((row) => [row.robloxUserId, row]));

  return ((id: number | null | undefined) =>
    id == null
      ? null
      : (byId.get(id) ?? { robloxUserId: id, username: null, displayName: null })) as UserRefLookup;
}
