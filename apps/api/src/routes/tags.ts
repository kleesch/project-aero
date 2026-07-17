import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  CLAIM_KEYS,
  tagCreateSchema,
  type TagView,
} from '@aero/shared';
import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';

import { db } from '../db/client.js';
import { billTags, tags } from '../db/schema.js';
import { requireClaim } from '../middleware/claims.js';
import { audit, auditContext, toSnapshot } from '../services/audit.js';
import { isUniqueViolation, parseBody, parseIdParam } from './helpers.js';

/**
 * Tag vocabulary, mounted at /api/tags. Reading is public (the bill list
 * filter needs it); managing the vocabulary is `tags:manage` (`admin`
 * implies it). Applying tags to a bill lives on the bills router under
 * `bill:submit`.
 */
export const tagsRouter = Router();

function toTagView(row: typeof tags.$inferSelect): TagView {
  return { id: row.id, name: row.name, description: row.description };
}

tagsRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db.select().from(tags).orderBy(asc(tags.name));
    res.json(rows.map(toTagView));
  } catch (error) {
    next(error);
  }
});

tagsRouter.post('/', requireClaim(CLAIM_KEYS.TAGS_MANAGE), async (req, res, next) => {
  try {
    const body = parseBody(tagCreateSchema, req, res);
    if (!body) return;
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(tags)
        .values({ name: body.name, description: body.description ?? null })
        .returning();
      if (!row) throw new Error('Tag insert returned no row.');
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.TAG_CREATE,
        entityType: AUDIT_ENTITIES.TAG,
        entityId: row.id,
        after: toSnapshot(row),
      });
      return row;
    });
    res.status(201).json(toTagView(created));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: 'A tag with that name already exists.' });
      return;
    }
    next(error);
  }
});

tagsRouter.put('/:id', requireClaim(CLAIM_KEYS.TAGS_MANAGE), async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id, res);
    if (id === null) return;
    const body = parseBody(tagCreateSchema, req, res);
    if (!body) return;

    const updated = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(tags).where(eq(tags.id, id)).for('update');
      if (!before) return null;
      const [after] = await tx
        .update(tags)
        .set({ name: body.name, description: body.description ?? null, updatedAt: new Date() })
        .where(eq(tags.id, id))
        .returning();
      if (!after) throw new Error('Tag update returned no row.');
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.TAG_UPDATE,
        entityType: AUDIT_ENTITIES.TAG,
        entityId: after.id,
        before: toSnapshot(before),
        after: toSnapshot(after),
      });
      return after;
    });
    if (!updated) {
      res.status(404).json({ error: 'Tag not found.' });
      return;
    }
    res.json(toTagView(updated));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: 'A tag with that name already exists.' });
      return;
    }
    next(error);
  }
});

tagsRouter.delete('/:id', requireClaim(CLAIM_KEYS.TAGS_MANAGE), async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id, res);
    if (id === null) return;
    const deleted = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(tags).where(eq(tags.id, id)).for('update');
      if (!row) return null;
      // Removing a vocabulary entry detaches it from every bill; the audit
      // event records how many so the removal is reconstructible.
      const detached = await tx
        .delete(billTags)
        .where(eq(billTags.tagId, id))
        .returning({ billId: billTags.billId });
      await tx.delete(tags).where(eq(tags.id, id));
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.TAG_DELETE,
        entityType: AUDIT_ENTITIES.TAG,
        entityId: row.id,
        before: toSnapshot(row),
        after: { detachedFromBillIds: detached.map((entry) => entry.billId) },
      });
      return row;
    });
    if (!deleted) {
      res.status(404).json({ error: 'Tag not found.' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
