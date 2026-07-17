import { chamberSchema, CLAIM_KEYS, type RosterMemberView } from '@aero/shared';
import { asc, desc, eq } from 'drizzle-orm';
import { Router } from 'express';

import { db } from '../db/client.js';
import { congressRosters } from '../db/schema.js';
import { requireClaim } from '../middleware/claims.js';
import { syncRosters } from '../services/roster-sync.js';

/**
 * Congressional rosters, mounted at /api/rosters. Reading is public — votes
 * are attributed against these rosters and anyone may inspect them; only the
 * force-resync is claim-gated (per-route, unlike the router-level gates).
 */
export const rostersRouter = Router();

function toMemberView(row: typeof congressRosters.$inferSelect): RosterMemberView {
  return {
    chamber: row.chamber,
    robloxUserId: row.robloxUserId,
    username: row.usernameSnapshot,
    rank: row.rank,
    active: row.active,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastConfirmedAt: row.lastConfirmedAt.toISOString(),
  };
}

rostersRouter.get('/', async (req, res, next) => {
  try {
    const chamberFilter = chamberSchema.optional().safeParse(req.query.chamber ?? undefined);
    if (!chamberFilter.success) {
      res.status(400).json({ error: 'Invalid chamber filter.' });
      return;
    }
    const rows = await db
      .select()
      .from(congressRosters)
      .where(chamberFilter.data ? eq(congressRosters.chamber, chamberFilter.data) : undefined)
      .orderBy(
        asc(congressRosters.chamber),
        desc(congressRosters.active),
        desc(congressRosters.rank),
        asc(congressRosters.usernameSnapshot),
      );
    res.json(rows.map(toMemberView));
  } catch (error) {
    next(error);
  }
});

rostersRouter.post('/resync', requireClaim(CLAIM_KEYS.ROSTER_RESYNC), async (req, res, next) => {
  try {
    // requireClaim guarantees req.user.
    const summary = await syncRosters(req.user!.robloxUserId);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});
