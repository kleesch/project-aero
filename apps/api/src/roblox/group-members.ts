import { setTimeout as sleep } from 'node:timers/promises';

import { z } from 'zod';

/**
 * Generic "list every member of a ROBLOX group with their rank" poller (the
 * DESIGN.md future-scope module: pointing it at agency groups later yields
 * employment timelines). The congressional roster sync is its first consumer.
 */

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;
const PAGE_SIZE = 100;

export interface GroupMember {
  robloxUserId: number;
  username: string;
  displayName: string | null;
  rank: number;
  roleName: string;
}

const membersPageSchema = z.object({
  nextPageCursor: z.string().nullable(),
  data: z.array(
    z.object({
      user: z.object({
        userId: z.number(),
        username: z.string(),
        displayName: z.string().nullish(),
      }),
      role: z.object({ id: z.number(), name: z.string(), rank: z.number() }),
    }),
  ),
});

/** One page fetch with exponential-backoff retry on 429/5xx/network errors. */
async function fetchMembersPage(groupId: number, cursor: string | null) {
  const url = new URL(`https://groups.roblox.com/v1/groups/${groupId}/users`);
  url.searchParams.set('limit', String(PAGE_SIZE));
  if (cursor) url.searchParams.set('cursor', cursor);

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
      return membersPageSchema.parse(await response.json());
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Groups API fetch failed');
}

/**
 * Fetches the full membership of a group. Any page failing (after retries)
 * throws — a partial roster must never be diffed against the stored one, or
 * the missing members would all be marked departed.
 */
export async function fetchAllGroupMembers(groupId: number): Promise<GroupMember[]> {
  const members: GroupMember[] = [];
  let cursor: string | null = null;
  do {
    const page = await fetchMembersPage(groupId, cursor);
    for (const entry of page.data) {
      members.push({
        robloxUserId: entry.user.userId,
        username: entry.user.username,
        displayName: entry.user.displayName ?? null,
        rank: entry.role.rank,
        roleName: entry.role.name,
      });
    }
    cursor = page.nextPageCursor;
  } while (cursor !== null);
  return members;
}
