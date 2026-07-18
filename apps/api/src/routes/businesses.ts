import type { BusinessView, CourtRecordResponse } from '@aero/shared';
import { and, desc, eq, exists, sql } from 'drizzle-orm';
import { Router } from 'express';

import { db } from '../db/client.js';
import { businesses, rulingParties, rulings } from '../db/schema.js';
import {
  loadRulingListItems,
  rulingVisibilityWhere,
  viewerSeesNonActiveRulings,
} from '../services/rulings.js';
import { loadUserRefs } from '../services/user-refs.js';
import { parseIdParam } from './helpers.js';

/**
 * Minimal public business pages (phase 05), mounted at /api/businesses. The
 * businesses table lands here so ruling parties can reference it; phase 06
 * adds registration, ownership transfer, and licensing on top. Court records
 * respect the shared ruling visibility rule.
 */
export const businessesRouter = Router();

businessesRouter.get('/:id', async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id, res);
    if (id === null) return;
    const [row] = await db.select().from(businesses).where(eq(businesses.id, id));
    if (!row) {
      res.status(404).json({ error: 'No such business.' });
      return;
    }
    const refs = await loadUserRefs([row.ownerUserId]);
    res.json({
      id: row.id,
      name: row.name,
      status: row.status,
      owner: refs(row.ownerUserId),
      createdAt: row.createdAt.toISOString(),
    } satisfies BusinessView);
  } catch (error) {
    next(error);
  }
});

businessesRouter.get('/:id/court-record', async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id, res);
    if (id === null) return;
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
              .where(and(eq(rulingParties.rulingId, rulings.id), eq(rulingParties.businessId, id))),
          ),
        ),
      )
      .orderBy(desc(rulings.rulingDate), desc(rulings.id));
    res.json({ items: await loadRulingListItems(rows) } satisfies CourtRecordResponse);
  } catch (error) {
    next(error);
  }
});
