import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  CLAIM_KEYS,
  rosterRankRuleCreateSchema,
  type RosterRankRuleView,
} from '@aero/shared';
import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';

import { db } from '../db/client.js';
import { rosterRankRules } from '../db/schema.js';
import { requireClaim } from '../middleware/claims.js';
import { audit, auditContext, toSnapshot } from '../services/audit.js';
import { parseBody, parseIdParam } from './helpers.js';

/**
 * Rank-rule management (which Congress-group ranks form the House vs. the
 * Senate), mounted at /api/admin/roster-rank-rules and admin-only: the rules
 * decide whose votes can be recorded, so they sit at the same trust level as
 * claim mappings.
 */
export const adminRostersRouter = Router();

adminRostersRouter.use(requireClaim(CLAIM_KEYS.ADMIN));

function toRuleView(row: typeof rosterRankRules.$inferSelect): RosterRankRuleView {
  return { id: row.id, chamber: row.chamber, comparison: row.comparison, rankValue: row.rankValue };
}

adminRostersRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db.select().from(rosterRankRules).orderBy(asc(rosterRankRules.id));
    res.json(rows.map(toRuleView));
  } catch (error) {
    next(error);
  }
});

adminRostersRouter.post('/', async (req, res, next) => {
  try {
    const body = parseBody(rosterRankRuleCreateSchema, req, res);
    if (!body) return;
    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(rosterRankRules).values(body).returning();
      if (!row) throw new Error('Rank rule insert returned no row.');
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.ROSTER_RANK_RULE_CREATE,
        entityType: AUDIT_ENTITIES.ROSTER_RANK_RULE,
        entityId: row.id,
        after: toSnapshot(row),
      });
      return row;
    });
    res.status(201).json(toRuleView(created));
  } catch (error) {
    next(error);
  }
});

adminRostersRouter.put('/:id', async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id, res);
    if (id === null) return;
    const body = parseBody(rosterRankRuleCreateSchema, req, res);
    if (!body) return;

    const updated = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(rosterRankRules)
        .where(eq(rosterRankRules.id, id))
        .for('update');
      if (!before) return null;
      const [after] = await tx
        .update(rosterRankRules)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(rosterRankRules.id, id))
        .returning();
      if (!after) throw new Error('Rank rule update returned no row.');
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.ROSTER_RANK_RULE_UPDATE,
        entityType: AUDIT_ENTITIES.ROSTER_RANK_RULE,
        entityId: after.id,
        before: toSnapshot(before),
        after: toSnapshot(after),
      });
      return after;
    });
    if (!updated) {
      res.status(404).json({ error: 'Rank rule not found.' });
      return;
    }
    res.json(toRuleView(updated));
  } catch (error) {
    next(error);
  }
});

adminRostersRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id, res);
    if (id === null) return;
    const deleted = await db.transaction(async (tx) => {
      const [row] = await tx.delete(rosterRankRules).where(eq(rosterRankRules.id, id)).returning();
      if (!row) return null;
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.ROSTER_RANK_RULE_DELETE,
        entityType: AUDIT_ENTITIES.ROSTER_RANK_RULE,
        entityId: row.id,
        before: toSnapshot(row),
      });
      return row;
    });
    if (!deleted) {
      res.status(404).json({ error: 'Rank rule not found.' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
