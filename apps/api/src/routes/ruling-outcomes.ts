import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  CLAIM_KEYS,
  outcomeCreateSchema,
  type OutcomeView,
} from '@aero/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { Router } from 'express';

import { db } from '../db/client.js';
import { appealOutcomeLinks, rulingOutcomeLinks, rulingOutcomes } from '../db/schema.js';
import { requireClaim } from '../middleware/claims.js';
import { audit, auditContext, toSnapshot } from '../services/audit.js';
import { toOutcomeView } from '../services/rulings.js';
import { isUniqueViolation, parseBody, parseIdParam } from './helpers.js';

/**
 * Ruling outcome vocabulary (`guilty`, `not guilty`, …), mounted at
 * /api/ruling-outcomes. Reading is public (the court records filter needs
 * it); managing the vocabulary is `tags:manage`-style — the same
 * vocabulary-management claim gates both, and `admin` implies it. Unlike
 * bill tags, an outcome referenced by any ruling or appeal cannot be
 * deleted: court records are historical and must keep their outcomes.
 */
export const rulingOutcomesRouter = Router();

rulingOutcomesRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db.select().from(rulingOutcomes).orderBy(asc(rulingOutcomes.name));
    res.json(rows.map(toOutcomeView));
  } catch (error) {
    next(error);
  }
});

rulingOutcomesRouter.post('/', requireClaim(CLAIM_KEYS.TAGS_MANAGE), async (req, res, next) => {
  try {
    const body = parseBody(outcomeCreateSchema, req, res);
    if (!body) return;
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(rulingOutcomes)
        .values({ name: body.name, description: body.description ?? null })
        .returning();
      if (!row) throw new Error('Outcome insert returned no row.');
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.RULING_OUTCOME_CREATE,
        entityType: AUDIT_ENTITIES.RULING_OUTCOME,
        entityId: row.id,
        after: toSnapshot(row),
      });
      return row;
    });
    res.status(201).json(toOutcomeView(created) satisfies OutcomeView);
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: 'An outcome with that name already exists.' });
      return;
    }
    next(error);
  }
});

rulingOutcomesRouter.put('/:id', requireClaim(CLAIM_KEYS.TAGS_MANAGE), async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id, res);
    if (id === null) return;
    const body = parseBody(outcomeCreateSchema, req, res);
    if (!body) return;

    const updated = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(rulingOutcomes)
        .where(eq(rulingOutcomes.id, id))
        .for('update');
      if (!before) return null;
      const [after] = await tx
        .update(rulingOutcomes)
        .set({ name: body.name, description: body.description ?? null, updatedAt: new Date() })
        .where(eq(rulingOutcomes.id, id))
        .returning();
      if (!after) throw new Error('Outcome update returned no row.');
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.RULING_OUTCOME_UPDATE,
        entityType: AUDIT_ENTITIES.RULING_OUTCOME,
        entityId: after.id,
        before: toSnapshot(before),
        after: toSnapshot(after),
      });
      return after;
    });
    if (!updated) {
      res.status(404).json({ error: 'Outcome not found.' });
      return;
    }
    res.json(toOutcomeView(updated));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: 'An outcome with that name already exists.' });
      return;
    }
    next(error);
  }
});

rulingOutcomesRouter.delete(
  '/:id',
  requireClaim(CLAIM_KEYS.TAGS_MANAGE),
  async (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id, res);
      if (id === null) return;
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(rulingOutcomes)
          .where(eq(rulingOutcomes.id, id))
          .for('update');
        if (!row) return 'missing' as const;
        const [usage] = await tx
          .select({
            rulingUses: sql<number>`(select count(*)::int from ${rulingOutcomeLinks} where ${rulingOutcomeLinks.outcomeId} = ${id})`,
            appealUses: sql<number>`(select count(*)::int from ${appealOutcomeLinks} where ${appealOutcomeLinks.outcomeId} = ${id})`,
          })
          .from(rulingOutcomes)
          .where(eq(rulingOutcomes.id, id));
        if ((usage?.rulingUses ?? 0) > 0 || (usage?.appealUses ?? 0) > 0) {
          return 'in-use' as const;
        }
        await tx.delete(rulingOutcomes).where(eq(rulingOutcomes.id, id));
        await audit(tx, {
          ...auditContext(req),
          actionKey: AUDIT_ACTIONS.RULING_OUTCOME_DELETE,
          entityType: AUDIT_ENTITIES.RULING_OUTCOME,
          entityId: row.id,
          before: toSnapshot(row),
        });
        return 'deleted' as const;
      });
      if (result === 'missing') {
        res.status(404).json({ error: 'Outcome not found.' });
        return;
      }
      if (result === 'in-use') {
        res.status(409).json({
          error: 'This outcome is referenced by court records and cannot be deleted.',
        });
        return;
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
