import {
  AUDIT_ACTIONS,
  auditQuerySchema,
  auditRestoreSchema,
  CLAIM_KEYS,
  type AuditActionKey,
  type AuditEventView,
  type AuditLogPage,
} from '@aero/shared';
import { and, count, desc, eq, gte, isNull, lt, type SQL } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db/client.js';
import { auditEvents } from '../db/schema.js';
import { requireClaim } from '../middleware/claims.js';
import { isRestorableEntityType, restoreSnapshot } from '../services/audit-restore.js';
import { audit, auditContext, toSnapshot } from '../services/audit.js';
import { loadUserRefs, type UserRefLookup } from '../services/user-refs.js';

/**
 * Audit log read API (see DESIGN.md — Auditing), mounted at /api/audit.
 * Gated by `audit:view` (implied by `admin`), which covers every visibility
 * level — the participant-level surfaces for involved parties arrive with
 * the feature phases that need them.
 */
export const auditRouter = Router();

auditRouter.use(requireClaim(CLAIM_KEYS.AUDIT_VIEW));

export function toEventView(
  row: typeof auditEvents.$inferSelect,
  refs: UserRefLookup,
): AuditEventView {
  return {
    id: row.id,
    actor: refs(row.actorUserId),
    actionKey: row.actionKey as AuditActionKey,
    entityType: row.entityType,
    entityId: row.entityId,
    before: row.before,
    after: row.after,
    reason: row.reason,
    occurredAt: row.occurredAt.toISOString(),
    requestIp: row.requestIp,
    restorable: row.before !== null && isRestorableEntityType(row.entityType),
  };
}

auditRouter.get('/', async (req, res, next) => {
  try {
    const parsed = auditQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query parameters.', issues: parsed.error.issues });
      return;
    }
    const query = parsed.data;

    const conditions: SQL[] = [];
    if (query.actor === 'system') conditions.push(isNull(auditEvents.actorUserId));
    else if (typeof query.actor === 'number')
      conditions.push(eq(auditEvents.actorUserId, query.actor));
    if (query.entityType) conditions.push(eq(auditEvents.entityType, query.entityType));
    if (query.entityId) conditions.push(eq(auditEvents.entityId, query.entityId));
    if (query.action) conditions.push(eq(auditEvents.actionKey, query.action));
    if (query.from) conditions.push(gte(auditEvents.occurredAt, new Date(query.from)));
    if (query.to) conditions.push(lt(auditEvents.occurredAt, new Date(query.to)));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, totals] = await Promise.all([
      db
        .select()
        .from(auditEvents)
        .where(where)
        .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
        .limit(query.limit)
        .offset(query.offset),
      db.select({ total: count() }).from(auditEvents).where(where),
    ]);

    const refs = await loadUserRefs(rows.map((row) => row.actorUserId));
    res.json({
      events: rows.map((row) => toEventView(row, refs)),
      total: totals[0]?.total ?? 0,
    } satisfies AuditLogPage);
  } catch (error) {
    next(error);
  }
});

/**
 * Restore-from-audit, `admin`-gated: re-applies the `before` snapshot of an
 * audit event for opted-in entity types. The restore commits atomically with
 * its own `audit.restore` event. Mounted at /api/admin/audit.
 */
export const adminAuditRouter = Router();

adminAuditRouter.use(requireClaim(CLAIM_KEYS.ADMIN));

const eventIdSchema = z.coerce.number().int().positive();

adminAuditRouter.post('/:id/restore', async (req, res, next) => {
  try {
    const idResult = eventIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ error: 'Invalid audit event id.' });
      return;
    }
    const body = auditRestoreSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Invalid request body.', issues: body.error.issues });
      return;
    }

    const [event] = await db.select().from(auditEvents).where(eq(auditEvents.id, idResult.data));
    if (!event) {
      res.status(404).json({ error: 'Audit event not found.' });
      return;
    }
    if (!event.before) {
      res.status(422).json({ error: 'This audit event has no before snapshot to restore.' });
      return;
    }
    if (!isRestorableEntityType(event.entityType)) {
      res
        .status(422)
        .json({ error: `Entity type "${event.entityType}" is not restorable from audit.` });
      return;
    }

    const before = event.before;
    const entityType = event.entityType;
    await db.transaction(async (tx) => {
      const previous = await restoreSnapshot(tx, entityType, before);
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.AUDIT_RESTORE,
        entityType,
        entityId: event.entityId,
        before: previous ? toSnapshot(previous) : null,
        after: before,
        reason: body.data.reason,
      });
    });

    const refs = await loadUserRefs([event.actorUserId]);
    res.json({ restored: toEventView(event, refs) });
  } catch (error) {
    next(error);
  }
});
