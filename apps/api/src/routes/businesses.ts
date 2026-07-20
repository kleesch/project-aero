import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  businessListQuerySchema,
  businessRegisterSchema,
  businessTransferSchema,
  businessUpdateSchema,
  CLAIM_KEYS,
  LICENSE_STATUSES,
  licenseGrantSchema,
  licenseRevokeSchema,
  licenseUpdateSchema,
  ownerLookupQuerySchema,
  type BusinessListResponse,
  type CourtRecordResponse,
  type OwnerLookupResponse,
} from '@aero/shared';
import { and, desc, eq, exists, ilike, sql } from 'drizzle-orm';
import { Router, type Request, type Response } from 'express';

import { resolveUserClaims } from '../claims/resolution.js';
import { db } from '../db/client.js';
import {
  businessLicenses,
  businessLicenseTypes,
  businessOwnershipTransfers,
  businesses,
  rulingParties,
  rulings,
} from '../db/schema.js';
import { requireAuth, requireClaim } from '../middleware/claims.js';
import { audit, auditContext, toSnapshot } from '../services/audit.js';
import {
  ensureOwnerUser,
  licensedWhere,
  loadBusinessDetail,
  loadBusinessListItems,
} from '../services/businesses.js';
import {
  countAll,
  escapeLike,
  loadRulingListItems,
  rulingVisibilityWhere,
  viewerSeesNonActiveRulings,
} from '../services/rulings.js';
import { searchUsers } from '../services/user-lookup.js';
import { parseBody, parseIdParam } from './helpers.js';

/**
 * Business registration (see DESIGN.md — Business), mounted at
 * /api/businesses. The directory and detail pages are public; mutations are
 * governed by two deliberately separate regimes: registration and licensing
 * are claim-gated, while detail edits belong to the owner alone — no claim,
 * including `admin`, overrides ownership (transfers are the one admin
 * recovery path, per spec).
 */
export const businessesRouter = Router();

/** Resolves :id to a business row, answering 404 when there is none. */
async function loadBusiness(req: Request, res: Response) {
  const id = parseIdParam(req.params.id, res);
  if (id === null) return null;
  const [row] = await db.select().from(businesses).where(eq(businesses.id, id));
  if (!row) {
    res.status(404).json({ error: 'No such business.' });
    return null;
  }
  return row;
}

// --- Owner lookup -------------------------------------------------------------

/**
 * User typeahead for the registrar and transfer forms — the shared phase-05
 * lookup, users only. Read-only (no stub rows are created here; the mutation
 * endpoints stub unknown owners at submit time), so any signed-in user may
 * search — plain owners need it to pick a transfer target.
 */
businessesRouter.get('/owner-lookup', requireAuth, async (req, res, next) => {
  try {
    const query = ownerLookupQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: 'Invalid query.', issues: query.error.issues });
      return;
    }
    const { hits } = await searchUsers(query.data.q);
    res.json({ users: hits } satisfies OwnerLookupResponse);
  } catch (error) {
    next(error);
  }
});

// --- Public reads -------------------------------------------------------------

businessesRouter.get('/', async (req, res, next) => {
  try {
    const query = businessListQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: 'Invalid query.', issues: query.error.issues });
      return;
    }
    const { q, licensed, page, pageSize } = query.data;

    const conditions = [];
    if (q !== undefined) conditions.push(ilike(businesses.name, `%${escapeLike(q)}%`));
    if (licensed !== undefined) conditions.push(licensedWhere(licensed));
    const where = conditions.length ? and(...conditions) : undefined;

    const [countRow] = await db.select({ total: countAll }).from(businesses).where(where);
    const rows = await db
      .select()
      .from(businesses)
      .where(where)
      .orderBy(businesses.name, businesses.id)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      items: await loadBusinessListItems(rows),
      total: countRow?.total ?? 0,
      page,
      pageSize,
    } satisfies BusinessListResponse);
  } catch (error) {
    next(error);
  }
});

businessesRouter.get('/:id', async (req, res, next) => {
  try {
    const business = await loadBusiness(req, res);
    if (!business) return;
    res.json(await loadBusinessDetail(business));
  } catch (error) {
    next(error);
  }
});

businessesRouter.get('/:id/court-record', async (req, res, next) => {
  try {
    const business = await loadBusiness(req, res);
    if (!business) return;
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
                  eq(rulingParties.businessId, business.id),
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

// --- Registration -------------------------------------------------------------

businessesRouter.post('/', requireClaim(CLAIM_KEYS.BUSINESS_REGISTER), async (req, res, next) => {
  try {
    const body = parseBody(businessRegisterSchema, req, res);
    if (!body) return;

    const ownerProblem = await ensureOwnerUser(req, body.ownerRobloxUserId);
    if (ownerProblem) {
      res.status(422).json({ error: ownerProblem });
      return;
    }

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(businesses)
        .values({
          name: body.name,
          ownerUserId: body.ownerRobloxUserId,
          createdBy: req.user!.robloxUserId,
        })
        .returning();
      if (!row) throw new Error('Business insert returned no row.');
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.BUSINESS_REGISTER,
        entityType: AUDIT_ENTITIES.BUSINESS,
        entityId: row.id,
        after: toSnapshot(row),
      });
      return row;
    });
    res.status(201).json(await loadBusinessDetail(created));
  } catch (error) {
    next(error);
  }
});

// --- Owner-only edits ----------------------------------------------------------

/**
 * Detail edits belong to the owner alone — deliberately outside the claims
 * system per spec, so holding `business:register` (or even `admin`) does not
 * grant edit rights over someone else's business.
 */
businessesRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const business = await loadBusiness(req, res);
    if (!business) return;
    if (business.ownerUserId !== req.user!.robloxUserId) {
      res.status(403).json({ error: 'Only the owner may edit this business.' });
      return;
    }
    const body = parseBody(businessUpdateSchema, req, res);
    if (!body) return;

    const updated = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(businesses)
        .where(eq(businesses.id, business.id))
        .for('update');
      // Ownership is rechecked under the row lock — a concurrent transfer
      // must not let the previous owner's edit slip through.
      if (!before || before.ownerUserId !== req.user!.robloxUserId) return null;
      const [after] = await tx
        .update(businesses)
        .set({ name: body.name, updatedAt: new Date() })
        .where(eq(businesses.id, business.id))
        .returning();
      if (!after) throw new Error('Business update returned no row.');
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.BUSINESS_UPDATE,
        entityType: AUDIT_ENTITIES.BUSINESS,
        entityId: after.id,
        before: { name: before.name },
        after: { name: after.name },
      });
      return after;
    });
    if (!updated) {
      res.status(403).json({ error: 'Only the owner may edit this business.' });
      return;
    }
    res.json(await loadBusinessDetail(updated));
  } catch (error) {
    next(error);
  }
});

// --- Ownership transfer ---------------------------------------------------------

/** Initiated by the current owner, or an admin for recovery (per spec). */
businessesRouter.post('/:id/transfer', requireAuth, async (req, res, next) => {
  try {
    const business = await loadBusiness(req, res);
    if (!business) return;
    const body = parseBody(businessTransferSchema, req, res);
    if (!body) return;

    const actorId = req.user!.robloxUserId;
    if (business.ownerUserId !== actorId) {
      const resolution = await resolveUserClaims(actorId);
      if (!resolution.claims.includes(CLAIM_KEYS.ADMIN)) {
        res.status(403).json({ error: 'Only the owner (or an admin) may transfer ownership.' });
        return;
      }
    }
    if (body.toRobloxUserId === business.ownerUserId) {
      res.status(422).json({ error: 'The business already belongs to that user.' });
      return;
    }
    const ownerProblem = await ensureOwnerUser(req, body.toRobloxUserId);
    if (ownerProblem) {
      res.status(422).json({ error: ownerProblem });
      return;
    }

    const transferred = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(businesses)
        .where(eq(businesses.id, business.id))
        .for('update');
      // The owner may have changed since the pre-check; only the state read
      // under the lock counts.
      if (!current || current.ownerUserId !== business.ownerUserId) return null;
      const [after] = await tx
        .update(businesses)
        .set({ ownerUserId: body.toRobloxUserId, updatedAt: new Date() })
        .where(eq(businesses.id, business.id))
        .returning();
      if (!after) throw new Error('Ownership update returned no row.');
      const [transfer] = await tx
        .insert(businessOwnershipTransfers)
        .values({
          businessId: business.id,
          fromUserId: current.ownerUserId,
          toUserId: body.toRobloxUserId,
          initiatedBy: actorId,
          reason: body.reason ?? null,
        })
        .returning();
      if (!transfer) throw new Error('Transfer insert returned no row.');
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.BUSINESS_TRANSFER,
        entityType: AUDIT_ENTITIES.BUSINESS,
        entityId: business.id,
        before: { ownerUserId: current.ownerUserId },
        after: { ownerUserId: body.toRobloxUserId, transferId: transfer.id },
        reason: body.reason ?? null,
      });
      return after;
    });
    if (!transferred) {
      res.status(409).json({ error: 'Ownership changed concurrently; reload and retry.' });
      return;
    }
    res.json(await loadBusinessDetail(transferred));
  } catch (error) {
    next(error);
  }
});

// --- Licenses -------------------------------------------------------------------

businessesRouter.post(
  '/:id/licenses',
  requireClaim(CLAIM_KEYS.BUSINESS_LICENSE_GRANT),
  async (req, res, next) => {
    try {
      const business = await loadBusiness(req, res);
      if (!business) return;
      const body = parseBody(licenseGrantSchema, req, res);
      if (!body) return;

      const [licenseType] = await db
        .select()
        .from(businessLicenseTypes)
        .where(eq(businessLicenseTypes.id, body.licenseTypeId));
      if (!licenseType) {
        res.status(422).json({ error: 'Unknown license type.' });
        return;
      }

      const granted = await db.transaction(async (tx) => {
        // The business row lock serializes concurrent grants of the same type.
        await tx.select().from(businesses).where(eq(businesses.id, business.id)).for('update');
        const [duplicate] = await tx
          .select({ id: businessLicenses.id })
          .from(businessLicenses)
          .where(
            and(
              eq(businessLicenses.businessId, business.id),
              eq(businessLicenses.licenseTypeId, body.licenseTypeId),
              eq(businessLicenses.status, LICENSE_STATUSES.ACTIVE),
            ),
          );
        if (duplicate) return null;
        const [row] = await tx
          .insert(businessLicenses)
          .values({
            businessId: business.id,
            licenseTypeId: body.licenseTypeId,
            grantedBy: req.user!.robloxUserId,
            expiresAt: body.expiresAt === undefined ? null : new Date(body.expiresAt),
          })
          .returning();
        if (!row) throw new Error('License insert returned no row.');
        await audit(tx, {
          ...auditContext(req),
          actionKey: AUDIT_ACTIONS.LICENSE_GRANT,
          entityType: AUDIT_ENTITIES.BUSINESS_LICENSE,
          entityId: row.id,
          after: toSnapshot(row),
        });
        return row;
      });
      if (!granted) {
        res.status(409).json({ error: 'The business already holds an active license of that type.' });
        return;
      }
      res.status(201).json(await loadBusinessDetail(business));
    } catch (error) {
      next(error);
    }
  },
);

/** Loads :licenseId scoped to the business, answering 404 when absent. */
async function loadLicense(req: Request, res: Response, businessId: number) {
  const licenseId = parseIdParam(req.params.licenseId, res);
  if (licenseId === null) return null;
  const [row] = await db
    .select()
    .from(businessLicenses)
    .where(and(eq(businessLicenses.id, licenseId), eq(businessLicenses.businessId, businessId)));
  if (!row) {
    res.status(404).json({ error: 'No such license on this business.' });
    return null;
  }
  return row;
}

businessesRouter.patch(
  '/:id/licenses/:licenseId',
  requireClaim(CLAIM_KEYS.BUSINESS_LICENSE_GRANT),
  async (req, res, next) => {
    try {
      const business = await loadBusiness(req, res);
      if (!business) return;
      const license = await loadLicense(req, res, business.id);
      if (!license) return;
      const body = parseBody(licenseUpdateSchema, req, res);
      if (!body) return;
      if (license.status !== LICENSE_STATUSES.ACTIVE) {
        res.status(409).json({ error: 'Only active licenses can be updated.' });
        return;
      }

      await db.transaction(async (tx) => {
        const [after] = await tx
          .update(businessLicenses)
          .set({
            expiresAt: body.expiresAt === null ? null : new Date(body.expiresAt),
            updatedAt: new Date(),
          })
          .where(eq(businessLicenses.id, license.id))
          .returning();
        if (!after) throw new Error('License update returned no row.');
        await audit(tx, {
          ...auditContext(req),
          actionKey: AUDIT_ACTIONS.LICENSE_UPDATE,
          entityType: AUDIT_ENTITIES.BUSINESS_LICENSE,
          entityId: license.id,
          before: { expiresAt: license.expiresAt?.toISOString() ?? null },
          after: { expiresAt: after.expiresAt?.toISOString() ?? null },
        });
      });
      res.json(await loadBusinessDetail(business));
    } catch (error) {
      next(error);
    }
  },
);

businessesRouter.post(
  '/:id/licenses/:licenseId/revoke',
  requireClaim(CLAIM_KEYS.BUSINESS_LICENSE_GRANT),
  async (req, res, next) => {
    try {
      const business = await loadBusiness(req, res);
      if (!business) return;
      const license = await loadLicense(req, res, business.id);
      if (!license) return;
      const body = parseBody(licenseRevokeSchema, req, res);
      if (!body) return;

      const revoked = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(businessLicenses)
          .where(eq(businessLicenses.id, license.id))
          .for('update');
        if (!current || current.status !== LICENSE_STATUSES.ACTIVE) return null;
        const [after] = await tx
          .update(businessLicenses)
          .set({
            status: LICENSE_STATUSES.REVOKED,
            revokedAt: new Date(),
            revokedBy: req.user!.robloxUserId,
            revokeReason: body.reason,
            updatedAt: new Date(),
          })
          .where(eq(businessLicenses.id, license.id))
          .returning();
        if (!after) throw new Error('License revoke returned no row.');
        await audit(tx, {
          ...auditContext(req),
          actionKey: AUDIT_ACTIONS.LICENSE_REVOKE,
          entityType: AUDIT_ENTITIES.BUSINESS_LICENSE,
          entityId: license.id,
          before: { status: current.status },
          after: { status: after.status },
          reason: body.reason,
        });
        return after;
      });
      if (!revoked) {
        res.status(409).json({ error: 'Only active licenses can be revoked.' });
        return;
      }
      res.json(await loadBusinessDetail(business));
    } catch (error) {
      next(error);
    }
  },
);
