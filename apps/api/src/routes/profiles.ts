import type { BusinessListItemView, CourtRecordResponse, UserProfileView } from '@aero/shared';
import { and, asc, desc, eq, exists, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db/client.js';
import { businesses, rulingParties, rulings, users } from '../db/schema.js';
import { loadBusinessListItems } from '../services/businesses.js';
import {
  loadRulingListItems,
  rulingVisibilityWhere,
  viewerSeesNonActiveRulings,
} from '../services/rulings.js';

/**
 * Public profiles, mounted at /api/users. A profile is composed of
 * independent sections (see DESIGN.md — Extensibility): the identity card,
 * the court-record section (phase 05), and the owned-businesses section
 * (phase 06). Court records respect the shared ruling visibility rule.
 */
export const profilesRouter = Router();

const robloxIdSchema = z.coerce.number().int().positive();

profilesRouter.get('/:robloxId', async (req, res, next) => {
  try {
    const parsed = robloxIdSchema.safeParse(req.params.robloxId);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid ROBLOX user id.' });
      return;
    }
    const [row] = await db.select().from(users).where(eq(users.robloxUserId, parsed.data));
    if (!row) {
      res.status(404).json({ error: 'No such user.' });
      return;
    }
    res.json({
      robloxUserId: row.robloxUserId,
      username: row.username,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    } satisfies UserProfileView);
  } catch (error) {
    next(error);
  }
});

profilesRouter.get('/:robloxId/court-record', async (req, res, next) => {
  try {
    const parsed = robloxIdSchema.safeParse(req.params.robloxId);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid ROBLOX user id.' });
      return;
    }
    const rows = await db
      .select()
      .from(rulings)
      .where(
        and(
          rulingVisibilityWhere(await viewerSeesNonActiveRulings(req)),
          exists(
            db
              .select({ one: sql`1` })
              .from(rulingParties)
              .where(
                and(
                  eq(rulingParties.rulingId, rulings.id),
                  eq(rulingParties.robloxUserId, parsed.data),
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(rulings.rulingDate), desc(rulings.id));
    res.json({ items: await loadRulingListItems(rows) } satisfies CourtRecordResponse);
  } catch (error) {
    next(error);
  }
});

profilesRouter.get('/:robloxId/businesses', async (req, res, next) => {
  try {
    const parsed = robloxIdSchema.safeParse(req.params.robloxId);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid ROBLOX user id.' });
      return;
    }
    const rows = await db
      .select()
      .from(businesses)
      .where(eq(businesses.ownerUserId, parsed.data))
      .orderBy(asc(businesses.name));
    res.json({ items: await loadBusinessListItems(rows) } satisfies {
      items: BusinessListItemView[];
    });
  } catch (error) {
    next(error);
  }
});
