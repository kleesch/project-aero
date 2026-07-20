import type { PartyLookupUser } from '@aero/shared';
import { eq, ilike, or, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { findRobloxUserById, findRobloxUserByUsername, type RobloxUser } from '../roblox/users.js';
import { escapeLike } from './rulings.js';

/**
 * User typeahead shared by the ruling party lookup (phase 05) and the
 * business owner lookup (phase 06): platform users first, then a ROBLOX
 * fetch for ids/usernames we have never seen. Read-only — callers that need
 * the ROBLOX-only hits referenceable by foreign key (ruling parties) create
 * stubs from `robloxOnly` themselves; callers that stub at submit time
 * (business registration/transfer) leave them be.
 */

export const USER_LOOKUP_LIMIT = 10;

export interface UserLookupResult {
  hits: PartyLookupUser[];
  /** Hits fetched from ROBLOX with no users row yet (subset of `hits`). */
  robloxOnly: RobloxUser[];
}

export async function searchUsers(q: string): Promise<UserLookupResult> {
  const pattern = `%${escapeLike(q)}%`;

  const toHit = (row: {
    robloxUserId: number;
    username: string | null;
    displayName: string | null;
    lastLoginAt: Date | null;
  }): PartyLookupUser => ({
    robloxUserId: row.robloxUserId,
    username: row.username ?? `user #${row.robloxUserId}`,
    displayName: row.displayName,
    isPlatformUser: row.lastLoginAt !== null,
  });

  const hits: PartyLookupUser[] = [];
  const robloxOnly: RobloxUser[] = [];

  if (/^\d+$/.test(q)) {
    const id = Number(q);
    const [local] = await db.select().from(users).where(eq(users.robloxUserId, id));
    if (local) {
      hits.push(toHit(local));
    } else {
      const robloxUser = await findRobloxUserById(id);
      if (robloxUser) {
        robloxOnly.push(robloxUser);
        hits.push({ ...robloxUser, isPlatformUser: false });
      }
    }
    return { hits, robloxOnly };
  }

  const locals = await db
    .select()
    .from(users)
    .where(or(ilike(users.username, pattern), ilike(users.displayName, pattern)))
    // Users who have actually logged in outrank stub rows.
    .orderBy(sql`(${users.lastLoginAt} IS NOT NULL) DESC`, users.username)
    .limit(USER_LOOKUP_LIMIT);
  hits.push(...locals.map(toHit));
  if (locals.length === 0) {
    // Forgiving fallback: the exact-username ROBLOX lookup catches people
    // nobody on the platform has referenced yet.
    const robloxUser = await findRobloxUserByUsername(q);
    if (robloxUser) {
      robloxOnly.push(robloxUser);
      hits.push({ ...robloxUser, isPlatformUser: false });
    }
  }
  return { hits, robloxOnly };
}
