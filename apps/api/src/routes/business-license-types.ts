import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  CLAIM_KEYS,
  licenseTypeCreateSchema,
  type LicenseTypeView,
} from '@aero/shared';
import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';

import { db } from '../db/client.js';
import { businessLicenses, businessLicenseTypes } from '../db/schema.js';
import { requireClaim } from '../middleware/claims.js';
import { audit, auditContext, toSnapshot } from '../services/audit.js';
import { toLicenseTypeView } from '../services/businesses.js';
import { isUniqueViolation, parseBody, parseIdParam } from './helpers.js';

/**
 * Business license-type vocabulary, mounted at /api/business-license-types.
 * Reading is public (the directory filter and grant form need it); managing
 * the vocabulary is `tags:manage` (`admin` implies it), the same regime as
 * tags and ruling outcomes. Granting licenses lives on the businesses router
 * under `business:license-grant`.
 */
export const businessLicenseTypesRouter = Router();

businessLicenseTypesRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(businessLicenseTypes)
      .orderBy(asc(businessLicenseTypes.name));
    res.json(rows.map(toLicenseTypeView) satisfies LicenseTypeView[]);
  } catch (error) {
    next(error);
  }
});

businessLicenseTypesRouter.post(
  '/',
  requireClaim(CLAIM_KEYS.TAGS_MANAGE),
  async (req, res, next) => {
    try {
      const body = parseBody(licenseTypeCreateSchema, req, res);
      if (!body) return;
      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(businessLicenseTypes)
          .values({ name: body.name, description: body.description ?? null })
          .returning();
        if (!row) throw new Error('License type insert returned no row.');
        await audit(tx, {
          ...auditContext(req),
          actionKey: AUDIT_ACTIONS.LICENSE_TYPE_CREATE,
          entityType: AUDIT_ENTITIES.LICENSE_TYPE,
          entityId: row.id,
          after: toSnapshot(row),
        });
        return row;
      });
      res.status(201).json(toLicenseTypeView(created));
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: 'A license type with that name already exists.' });
        return;
      }
      next(error);
    }
  },
);

businessLicenseTypesRouter.put(
  '/:id',
  requireClaim(CLAIM_KEYS.TAGS_MANAGE),
  async (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id, res);
      if (id === null) return;
      const body = parseBody(licenseTypeCreateSchema, req, res);
      if (!body) return;

      const updated = await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(businessLicenseTypes)
          .where(eq(businessLicenseTypes.id, id))
          .for('update');
        if (!before) return null;
        const [after] = await tx
          .update(businessLicenseTypes)
          .set({ name: body.name, description: body.description ?? null, updatedAt: new Date() })
          .where(eq(businessLicenseTypes.id, id))
          .returning();
        if (!after) throw new Error('License type update returned no row.');
        await audit(tx, {
          ...auditContext(req),
          actionKey: AUDIT_ACTIONS.LICENSE_TYPE_UPDATE,
          entityType: AUDIT_ENTITIES.LICENSE_TYPE,
          entityId: after.id,
          before: toSnapshot(before),
          after: toSnapshot(after),
        });
        return after;
      });
      if (!updated) {
        res.status(404).json({ error: 'License type not found.' });
        return;
      }
      res.json(toLicenseTypeView(updated));
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: 'A license type with that name already exists.' });
        return;
      }
      next(error);
    }
  },
);

businessLicenseTypesRouter.delete(
  '/:id',
  requireClaim(CLAIM_KEYS.TAGS_MANAGE),
  async (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id, res);
      if (id === null) return;
      const deleted = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(businessLicenseTypes)
          .where(eq(businessLicenseTypes.id, id))
          .for('update');
        if (!row) return null;
        // Unlike tags, granted licenses are records, not labels — a type that
        // has ever been granted cannot be deleted, only renamed.
        const [referencing] = await tx
          .select({ id: businessLicenses.id })
          .from(businessLicenses)
          .where(eq(businessLicenses.licenseTypeId, id))
          .limit(1);
        if (referencing) throw new LicenseTypeInUseError();
        await tx.delete(businessLicenseTypes).where(eq(businessLicenseTypes.id, id));
        await audit(tx, {
          ...auditContext(req),
          actionKey: AUDIT_ACTIONS.LICENSE_TYPE_DELETE,
          entityType: AUDIT_ENTITIES.LICENSE_TYPE,
          entityId: row.id,
          before: toSnapshot(row),
        });
        return row;
      });
      if (!deleted) {
        res.status(404).json({ error: 'License type not found.' });
        return;
      }
      res.status(204).end();
    } catch (error) {
      if (error instanceof LicenseTypeInUseError) {
        res
          .status(409)
          .json({ error: 'Licenses of this type exist; rename the type instead of deleting it.' });
        return;
      }
      next(error);
    }
  },
);

class LicenseTypeInUseError extends Error {}
