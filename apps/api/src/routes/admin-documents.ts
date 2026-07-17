import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  CLAIM_KEYS,
  documentQuarantineSchema,
  type DocumentView,
} from '@aero/shared';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { db } from '../db/client.js';
import { documents } from '../db/schema.js';
import { requireClaim } from '../middleware/claims.js';
import { audit, auditContext, toSnapshot } from '../services/audit.js';
import { toDocumentView } from '../services/documents.js';
import { loadUserRefs } from '../services/user-refs.js';

/**
 * Document administration (see DESIGN.md — PDF Storage & Safety →
 * quarantine), mounted at /api/admin/documents. Quarantine flips
 * `quarantined_at`; the file origin answers 410 from the very next request,
 * platform-wide, without touching any record that references the document.
 */
export const adminDocumentsRouter = Router();

adminDocumentsRouter.use(requireClaim(CLAIM_KEYS.ADMIN));

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

adminDocumentsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query parameters.', issues: parsed.error.issues });
      return;
    }
    const rows = await db
      .select()
      .from(documents)
      .orderBy(desc(documents.createdAt), desc(documents.id))
      .limit(parsed.data.limit)
      .offset(parsed.data.offset);
    const refs = await loadUserRefs(rows.map((row) => row.uploaderUserId));
    res.json(rows.map((row) => toDocumentView(row, refs)) satisfies DocumentView[]);
  } catch (error) {
    next(error);
  }
});

const idSchema = z.uuid();

function parseDocumentId(raw: unknown, res: Response): string | null {
  const result = idSchema.safeParse(raw);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid document id.' });
    return null;
  }
  return result.data;
}

/** Shared by quarantine/un-quarantine — they differ only in direction. */
function setQuarantine(quarantine: boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseDocumentId(req.params.id, res);
      if (id === null) return;
      const body = documentQuarantineSchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: 'Invalid request body.', issues: body.error.issues });
        return;
      }

      const updated = await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(documents)
          .where(
            and(
              eq(documents.id, id),
              quarantine ? isNull(documents.quarantinedAt) : isNotNull(documents.quarantinedAt),
            ),
          )
          .for('update');
        if (!before) return null;
        const [after] = await tx
          .update(documents)
          .set({ quarantinedAt: quarantine ? new Date() : null })
          .where(eq(documents.id, id))
          .returning();
        if (!after) throw new Error('Document quarantine update returned no row.');
        await audit(tx, {
          ...auditContext(req),
          actionKey: quarantine
            ? AUDIT_ACTIONS.DOCUMENT_QUARANTINE
            : AUDIT_ACTIONS.DOCUMENT_UNQUARANTINE,
          entityType: AUDIT_ENTITIES.DOCUMENT,
          entityId: after.id,
          before: toSnapshot(before),
          after: toSnapshot(after),
          reason: body.data.reason,
        });
        return after;
      });

      if (!updated) {
        const [exists] = await db.select().from(documents).where(eq(documents.id, id));
        if (!exists) {
          res.status(404).json({ error: 'Document not found.' });
        } else {
          res.status(409).json({
            error: quarantine ? 'Document is already quarantined.' : 'Document is not quarantined.',
          });
        }
        return;
      }
      const refs = await loadUserRefs([updated.uploaderUserId]);
      res.json(toDocumentView(updated, refs));
    } catch (error) {
      next(error);
    }
  };
}

adminDocumentsRouter.post('/:id/quarantine', setQuarantine(true));
adminDocumentsRouter.post('/:id/unquarantine', setQuarantine(false));
