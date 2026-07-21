import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  CLAIM_KEYS,
  EO_STATUSES,
  executiveOrderIssueSchema,
  executiveOrderListQuerySchema,
  executiveOrderStatusSchema,
  executiveOrderUpdateSchema,
  formatEoNumber,
  type EffectiveEoStatus,
  type ExecutiveOrderListResponse,
  type NextEoNumberResponse,
} from '@aero/shared';
import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { Router, type Request, type Response } from 'express';

import { db } from '../db/client.js';
import { executiveOrders } from '../db/schema.js';
import { requireClaim } from '../middleware/claims.js';
import { audit, auditContext, toSnapshot } from '../services/audit.js';
import { validateAttachableDocument } from '../services/documents.js';
import {
  effectiveStatusWhere,
  ensureIssuerUser,
  loadEoDetail,
  loadEoListItems,
  nextEoNumber,
} from '../services/executive-orders.js';
import { countAll, escapeLike } from '../services/rulings.js';
import { isUniqueViolation, parseBody, parseIdParam } from './helpers.js';

/**
 * Executive Orders (see PROJECT.md — Executive Orders), mounted at
 * /api/executive-orders. The archive and detail pages are public; issuing,
 * editing, and status corrections are gated `eo:manage` — the claim admins
 * wire to the presidential rank via the phase-02 mapping UI. `admin` does not
 * imply it (consistent with `bill:sign`).
 */
export const executiveOrdersRouter = Router();

/** Resolves a `:eoNumber` path param to a row, answering 404 when absent. */
async function loadByNumber(req: Request, res: Response) {
  const eoNumber = parseIdParam(req.params.eoNumber, res);
  if (eoNumber === null) return null;
  const [row] = await db
    .select()
    .from(executiveOrders)
    .where(eq(executiveOrders.eoNumber, eoNumber));
  if (!row) {
    res.status(404).json({ error: 'No such executive order.' });
    return null;
  }
  return row;
}

// --- Suggestion (must precede the /:eoNumber route) --------------------------

executiveOrdersRouter.get(
  '/next-number',
  requireClaim(CLAIM_KEYS.EO_MANAGE),
  async (_req, res, next) => {
    try {
      res.json({ nextNumber: await nextEoNumber() } satisfies NextEoNumberResponse);
    } catch (error) {
      next(error);
    }
  },
);

// --- Public reads ------------------------------------------------------------

executiveOrdersRouter.get('/', async (req, res, next) => {
  try {
    const query = executiveOrderListQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: 'Invalid query.', issues: query.error.issues });
      return;
    }
    const { status, issuedBy, from, to, q, missingSummary, page, pageSize } = query.data;

    const conditions = [];
    if (status !== undefined) {
      conditions.push(effectiveStatusWhere(status as EffectiveEoStatus));
    }
    if (issuedBy !== undefined) conditions.push(eq(executiveOrders.issuedBy, issuedBy));
    if (from !== undefined) conditions.push(gte(executiveOrders.effectiveDate, from));
    if (to !== undefined) conditions.push(lte(executiveOrders.effectiveDate, to));
    if (q !== undefined) {
      const pattern = `%${escapeLike(q)}%`;
      const numeric = /^\d+$/.test(q) ? eq(executiveOrders.eoNumber, Number(q)) : undefined;
      conditions.push(or(ilike(executiveOrders.title, pattern), numeric));
    }
    if (missingSummary === true) {
      conditions.push(
        or(sql`${executiveOrders.summary} IS NULL`, sql`btrim(${executiveOrders.summary}) = ''`),
      );
    } else if (missingSummary === false) {
      conditions.push(
        and(
          sql`${executiveOrders.summary} IS NOT NULL`,
          sql`btrim(${executiveOrders.summary}) <> ''`,
        ),
      );
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [countRow] = await db.select({ total: countAll }).from(executiveOrders).where(where);
    const rows = await db
      .select()
      .from(executiveOrders)
      .where(where)
      .orderBy(desc(executiveOrders.eoNumber))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      items: await loadEoListItems(rows),
      total: countRow?.total ?? 0,
      page,
      pageSize,
    } satisfies ExecutiveOrderListResponse);
  } catch (error) {
    next(error);
  }
});

executiveOrdersRouter.get('/:eoNumber', async (req, res, next) => {
  try {
    const order = await loadByNumber(req, res);
    if (!order) return;
    res.json(await loadEoDetail(order));
  } catch (error) {
    next(error);
  }
});

// --- Issue -------------------------------------------------------------------

executiveOrdersRouter.post('/', requireClaim(CLAIM_KEYS.EO_MANAGE), async (req, res, next) => {
  try {
    const body = parseBody(executiveOrderIssueSchema, req, res);
    if (!body) return;

    const documentProblem = await validateAttachableDocument(
      body.documentId,
      req.user!.robloxUserId,
    );
    if (documentProblem) {
      res.status(422).json({ error: documentProblem });
      return;
    }
    const issuerProblem = await ensureIssuerUser(req, body.issuedByRobloxUserId);
    if (issuerProblem) {
      res.status(422).json({ error: issuerProblem });
      return;
    }

    // Resolve an optional repeal/supersede target; it must be a currently
    // active order (you cannot repeal one already repealed or superseded).
    const targetId = body.repealsEoId ?? body.supersedesEoId;
    const linkKind: 'repeal' | 'supersede' | null =
      body.repealsEoId !== undefined ? 'repeal' : body.supersedesEoId !== undefined ? 'supersede' : null;
    if (targetId !== undefined) {
      const [target] = await db
        .select({ id: executiveOrders.id, status: executiveOrders.status })
        .from(executiveOrders)
        .where(eq(executiveOrders.id, targetId));
      if (!target) {
        res.status(422).json({ error: 'The order to repeal/supersede does not exist.' });
        return;
      }
      if (target.status !== EO_STATUSES.ACTIVE) {
        res.status(409).json({ error: 'That order is no longer active and cannot be modified.' });
        return;
      }
    }

    const created = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(executiveOrders)
        .values({
          eoNumber: body.eoNumber,
          title: body.title,
          summary: body.summary ?? null,
          issuedBy: body.issuedByRobloxUserId,
          effectiveDate: body.effectiveDate,
          expiresAt: body.expiresAt === undefined ? null : new Date(body.expiresAt),
          documentId: body.documentId,
          createdBy: req.user!.robloxUserId,
        })
        .returning();
      if (!order) throw new Error('Executive order insert returned no row.');

      // Flip the target in the same transaction, under its row lock.
      if (targetId !== undefined && linkKind !== null) {
        const [target] = await tx
          .select()
          .from(executiveOrders)
          .where(eq(executiveOrders.id, targetId))
          .for('update');
        if (!target || target.status !== EO_STATUSES.ACTIVE) throw new TargetNotActiveError();
        await tx
          .update(executiveOrders)
          .set(
            linkKind === 'repeal'
              ? { status: EO_STATUSES.REPEALED, repealedByEoId: order.id, updatedAt: new Date() }
              : {
                  status: EO_STATUSES.SUPERSEDED,
                  supersededByEoId: order.id,
                  updatedAt: new Date(),
                },
          )
          .where(eq(executiveOrders.id, targetId));
      }

      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.EO_ISSUE,
        entityType: AUDIT_ENTITIES.EXECUTIVE_ORDER,
        entityId: order.id,
        after: {
          ...toSnapshot(order),
          ...(linkKind === 'repeal' ? { repealsEoId: targetId } : {}),
          ...(linkKind === 'supersede' ? { supersedesEoId: targetId } : {}),
        },
      });
      return order;
    });
    res.status(201).json(await loadEoDetail(created));
  } catch (error) {
    if (error instanceof TargetNotActiveError) {
      res.status(409).json({ error: 'That order is no longer active and cannot be modified.' });
      return;
    }
    if (isUniqueViolation(error)) {
      res
        .status(409)
        .json({ error: `${formatEoNumber(req.body?.eoNumber ?? 0)} already exists; pick another number.` });
      return;
    }
    next(error);
  }
});

class TargetNotActiveError extends Error {}

// --- Edit --------------------------------------------------------------------

executiveOrdersRouter.patch(
  '/:eoNumber',
  requireClaim(CLAIM_KEYS.EO_MANAGE),
  async (req, res, next) => {
    try {
      const order = await loadByNumber(req, res);
      if (!order) return;
      const body = parseBody(executiveOrderUpdateSchema, req, res);
      if (!body) return;

      const updated = await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(executiveOrders)
          .where(eq(executiveOrders.id, order.id))
          .for('update');
        if (!before) return null;
        const [after] = await tx
          .update(executiveOrders)
          .set({
            title: body.title,
            summary: body.summary,
            effectiveDate: body.effectiveDate,
            expiresAt: body.expiresAt === null ? null : new Date(body.expiresAt),
            updatedAt: new Date(),
          })
          .where(eq(executiveOrders.id, order.id))
          .returning();
        if (!after) throw new Error('Executive order update returned no row.');
        await audit(tx, {
          ...auditContext(req),
          actionKey: AUDIT_ACTIONS.EO_UPDATE,
          entityType: AUDIT_ENTITIES.EXECUTIVE_ORDER,
          entityId: after.id,
          before: {
            title: before.title,
            summary: before.summary,
            effectiveDate: before.effectiveDate,
            expiresAt: before.expiresAt?.toISOString() ?? null,
          },
          after: {
            title: after.title,
            summary: after.summary,
            effectiveDate: after.effectiveDate,
            expiresAt: after.expiresAt?.toISOString() ?? null,
          },
        });
        return after;
      });
      if (!updated) {
        res.status(404).json({ error: 'No such executive order.' });
        return;
      }
      res.json(await loadEoDetail(updated));
    } catch (error) {
      next(error);
    }
  },
);

// --- Status correction -------------------------------------------------------

/**
 * Manual status set with a required reason — for mistakes and states a
 * backfill shim couldn't reach through the normal insert path. Link-driven
 * flips (repeal/supersede) happen automatically at issue time, not here.
 */
executiveOrdersRouter.post(
  '/:eoNumber/status',
  requireClaim(CLAIM_KEYS.EO_MANAGE),
  async (req, res, next) => {
    try {
      const order = await loadByNumber(req, res);
      if (!order) return;
      const body = parseBody(executiveOrderStatusSchema, req, res);
      if (!body) return;

      const updated = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(executiveOrders)
          .where(eq(executiveOrders.id, order.id))
          .for('update');
        if (!current) return null;
        const [after] = await tx
          .update(executiveOrders)
          .set({ status: body.status, updatedAt: new Date() })
          .where(eq(executiveOrders.id, order.id))
          .returning();
        if (!after) throw new Error('Executive order status update returned no row.');
        await audit(tx, {
          ...auditContext(req),
          actionKey: AUDIT_ACTIONS.EO_STATUS_CHANGE,
          entityType: AUDIT_ENTITIES.EXECUTIVE_ORDER,
          entityId: after.id,
          before: { status: current.status },
          after: { status: after.status },
          reason: body.reason,
        });
        return after;
      });
      if (!updated) {
        res.status(404).json({ error: 'No such executive order.' });
        return;
      }
      res.json(await loadEoDetail(updated));
    } catch (error) {
      next(error);
    }
  },
);
