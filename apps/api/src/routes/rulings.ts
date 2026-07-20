import {
  appealSubmitSchema,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  CLAIM_KEYS,
  GOVERNMENT_PARTY_LABEL,
  partyLookupQuerySchema,
  RULING_STATUSES,
  rulingListQuerySchema,
  rulingModerationSchema,
  rulingSubmitSchema,
  type PartyLookupResponse,
  type RulingListResponse,
  type RulingStatus,
} from '@aero/shared';
import { and, desc, eq, exists, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { Router, type Request, type Response } from 'express';

import { db } from '../db/client.js';
import {
  appealOutcomeLinks,
  appeals,
  businesses,
  rulingOutcomeLinks,
  rulingParties,
  rulings,
  users,
} from '../db/schema.js';
import { requireClaim } from '../middleware/claims.js';
import { audit, auditContext } from '../services/audit.js';
import { validateAttachableDocument } from '../services/documents.js';
import {
  countAll,
  ensureStubUser,
  escapeLike,
  loadRulingDetail,
  loadRulingListItems,
  rulingVisibilityWhere,
  validateOutcomeIds,
  validateRulingParties,
  viewerSeesNonActiveRulings,
} from '../services/rulings.js';
import { searchUsers, USER_LOOKUP_LIMIT } from '../services/user-lookup.js';
import { isUniqueViolation, parseBody, parseIdParam } from './helpers.js';

/**
 * Judicial records (see DESIGN.md — Judicial), mounted at /api/rulings.
 * Reads are public but filtered by the visibility rule: anonymous viewers
 * (and the public API) see only active rulings; `court:submit`/`admin`
 * holders also see expunged/pardoned ones, flagged by status. Every mutation
 * carries its own claim gate.
 */
export const rulingsRouter = Router();

/** Resolves :id respecting visibility — a hidden ruling 404s like a missing one. */
async function loadVisibleRuling(req: Request, res: Response) {
  const id = parseIdParam(req.params.id, res);
  if (id === null) return null;
  const [ruling] = await db.select().from(rulings).where(eq(rulings.id, id));
  if (!ruling) {
    res.status(404).json({ error: 'No such ruling.' });
    return null;
  }
  if (ruling.status !== RULING_STATUSES.ACTIVE && !(await viewerSeesNonActiveRulings(req))) {
    res.status(404).json({ error: 'No such ruling.' });
    return null;
  }
  return ruling;
}

// --- Party lookup -----------------------------------------------------------

/**
 * Typeahead for the ruling entry form: the shared user lookup (platform users
 * first, ROBLOX fallback) plus businesses and the fixed government entity.
 * ROBLOX-only hits get a stub users row so the party can be referenced by
 * foreign key. Gated `court:submit` because it can create rows and calls the
 * ROBLOX API.
 */
rulingsRouter.get(
  '/party-lookup',
  requireClaim(CLAIM_KEYS.COURT_SUBMIT),
  async (req, res, next) => {
    try {
      const query = partyLookupQuerySchema.safeParse(req.query);
      if (!query.success) {
        res.status(400).json({ error: 'Invalid query.', issues: query.error.issues });
        return;
      }
      const q = query.data.q;
      const pattern = `%${escapeLike(q)}%`;

      const { hits: userHits, robloxOnly } = await searchUsers(q);
      for (const robloxUser of robloxOnly) {
        await ensureStubUser(robloxUser, auditContext(req));
      }

      const businessHits = await db
        .select({ id: businesses.id, name: businesses.name })
        .from(businesses)
        .where(ilike(businesses.name, pattern))
        .orderBy(businesses.name)
        .limit(USER_LOOKUP_LIMIT);

      res.json({
        users: userHits,
        businesses: businessHits,
        government: GOVERNMENT_PARTY_LABEL.toLowerCase().includes(q.toLowerCase()),
      } satisfies PartyLookupResponse);
    } catch (error) {
      next(error);
    }
  },
);

// --- Public reads -----------------------------------------------------------

rulingsRouter.get('/', async (req, res, next) => {
  try {
    const query = rulingListQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: 'Invalid query.', issues: query.error.issues });
      return;
    }
    const { partyType, outcomeId, from, to, party, page, pageSize } = query.data;

    const conditions = [rulingVisibilityWhere(await viewerSeesNonActiveRulings(req))];
    if (from !== undefined) conditions.push(gte(rulings.rulingDate, from));
    if (to !== undefined) conditions.push(lte(rulings.rulingDate, to));
    if (partyType !== undefined) {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(rulingParties)
            .where(
              and(eq(rulingParties.rulingId, rulings.id), eq(rulingParties.partyType, partyType)),
            ),
        ),
      );
    }
    if (outcomeId !== undefined) {
      // An outcome matches whether the original ruling or its appeal carries it.
      conditions.push(
        or(
          exists(
            db
              .select({ one: sql`1` })
              .from(rulingOutcomeLinks)
              .where(
                and(
                  eq(rulingOutcomeLinks.rulingId, rulings.id),
                  eq(rulingOutcomeLinks.outcomeId, outcomeId),
                ),
              ),
          ),
          exists(
            db
              .select({ one: sql`1` })
              .from(appealOutcomeLinks)
              .innerJoin(appeals, eq(appealOutcomeLinks.appealId, appeals.id))
              .where(
                and(eq(appeals.rulingId, rulings.id), eq(appealOutcomeLinks.outcomeId, outcomeId)),
              ),
          ),
        ),
      );
    }
    if (party !== undefined) {
      const pattern = `%${escapeLike(party)}%`;
      const partyConditions = [
        ilike(users.username, pattern),
        ilike(users.displayName, pattern),
        ilike(businesses.name, pattern),
      ];
      if (GOVERNMENT_PARTY_LABEL.toLowerCase().includes(party.toLowerCase())) {
        partyConditions.push(eq(rulingParties.partyType, 'government'));
      }
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(rulingParties)
            .leftJoin(users, eq(rulingParties.robloxUserId, users.robloxUserId))
            .leftJoin(businesses, eq(rulingParties.businessId, businesses.id))
            .where(and(eq(rulingParties.rulingId, rulings.id), or(...partyConditions))),
        ),
      );
    }
    const where = and(...conditions);

    const [countRow] = await db.select({ total: countAll }).from(rulings).where(where);
    const rows = await db
      .select()
      .from(rulings)
      .where(where)
      .orderBy(desc(rulings.rulingDate), desc(rulings.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      items: await loadRulingListItems(rows),
      total: countRow?.total ?? 0,
      page,
      pageSize,
    } satisfies RulingListResponse);
  } catch (error) {
    next(error);
  }
});

rulingsRouter.get('/:id', async (req, res, next) => {
  try {
    const ruling = await loadVisibleRuling(req, res);
    if (!ruling) return;
    res.json(await loadRulingDetail(ruling));
  } catch (error) {
    next(error);
  }
});

// --- Ruling entry -----------------------------------------------------------

rulingsRouter.post('/', requireClaim(CLAIM_KEYS.COURT_SUBMIT), async (req, res, next) => {
  try {
    const body = parseBody(rulingSubmitSchema, req, res);
    if (!body) return;

    const documentProblem = await validateAttachableDocument(
      body.documentId,
      req.user!.robloxUserId,
    );
    if (documentProblem) {
      res.status(422).json({ error: documentProblem });
      return;
    }
    const outcomeProblem = await validateOutcomeIds(body.outcomeIds);
    if (outcomeProblem) {
      res.status(422).json({ error: outcomeProblem });
      return;
    }
    const partyProblem = await validateRulingParties(req, body.parties);
    if (partyProblem) {
      res.status(422).json({ error: partyProblem });
      return;
    }

    const created = await db.transaction(async (tx) => {
      const [ruling] = await tx
        .insert(rulings)
        .values({
          rulingDate: body.rulingDate,
          enteredBy: req.user!.robloxUserId,
          documentId: body.documentId,
        })
        .returning();
      if (!ruling) throw new Error('Ruling insert returned no row.');
      await tx.insert(rulingParties).values(
        body.parties.map((party) => ({
          rulingId: ruling.id,
          side: party.side,
          partyType: party.partyType,
          robloxUserId: party.partyType === 'user' ? party.robloxUserId : null,
          businessId: party.partyType === 'business' ? party.businessId : null,
        })),
      );
      await tx
        .insert(rulingOutcomeLinks)
        .values(body.outcomeIds.map((outcomeId) => ({ rulingId: ruling.id, outcomeId })));
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.RULING_SUBMIT,
        entityType: AUDIT_ENTITIES.RULING,
        entityId: ruling.id,
        after: {
          rulingDate: ruling.rulingDate,
          documentId: ruling.documentId,
          outcomeIds: body.outcomeIds,
          parties: body.parties,
        },
      });
      return ruling;
    });
    res.status(201).json(await loadRulingDetail(created));
  } catch (error) {
    next(error);
  }
});

// --- Appeal (Supreme Court verdict) -----------------------------------------

rulingsRouter.post(
  '/:id/appeal',
  requireClaim(CLAIM_KEYS.COURT_APPEAL_VERDICT),
  async (req, res, next) => {
    try {
      const ruling = await loadVisibleRuling(req, res);
      if (!ruling) return;
      const body = parseBody(appealSubmitSchema, req, res);
      if (!body) return;

      const documentProblem = await validateAttachableDocument(
        body.documentId,
        req.user!.robloxUserId,
      );
      if (documentProblem) {
        res.status(422).json({ error: documentProblem });
        return;
      }
      const outcomeProblem = await validateOutcomeIds(body.outcomeIds);
      if (outcomeProblem) {
        res.status(422).json({ error: outcomeProblem });
        return;
      }

      await db.transaction(async (tx) => {
        // The ruling row lock serializes concurrent appeal entries; the
        // unique index on appeals.ruling_id is the backstop.
        await tx.select().from(rulings).where(eq(rulings.id, ruling.id)).for('update');
        const [existing] = await tx
          .select({ id: appeals.id })
          .from(appeals)
          .where(eq(appeals.rulingId, ruling.id));
        if (existing) throw new AppealExistsError();
        const [appeal] = await tx
          .insert(appeals)
          .values({
            rulingId: ruling.id,
            documentId: body.documentId,
            enteredBy: req.user!.robloxUserId,
          })
          .returning();
        if (!appeal) throw new Error('Appeal insert returned no row.');
        await tx
          .insert(appealOutcomeLinks)
          .values(body.outcomeIds.map((outcomeId) => ({ appealId: appeal.id, outcomeId })));
        await audit(tx, {
          ...auditContext(req),
          actionKey: AUDIT_ACTIONS.RULING_APPEAL_SUBMIT,
          entityType: AUDIT_ENTITIES.RULING,
          entityId: ruling.id,
          after: { appealId: appeal.id, documentId: body.documentId, outcomeIds: body.outcomeIds },
        });
      });
      res.status(201).json(await loadRulingDetail(ruling));
    } catch (error) {
      if (error instanceof AppealExistsError || isUniqueViolation(error)) {
        res.status(409).json({ error: 'This ruling already has an appeal verdict.' });
        return;
      }
      next(error);
    }
  },
);

class AppealExistsError extends Error {}

// --- Expungement & pardon ---------------------------------------------------

/**
 * Both actions are the same state machine — active → hidden status, reason
 * required, no hard delete — differing only in claim and resulting status.
 * A judge without the presidential claim cannot pardon and vice versa.
 */
function moderationHandler(
  toStatus: Extract<RulingStatus, 'expunged' | 'pardoned'>,
  actionKey: typeof AUDIT_ACTIONS.RULING_EXPUNGE | typeof AUDIT_ACTIONS.RULING_PARDON,
) {
  return async (req: Request, res: Response, next: (error: unknown) => void) => {
    try {
      const ruling = await loadVisibleRuling(req, res);
      if (!ruling) return;
      const body = parseBody(rulingModerationSchema, req, res);
      if (!body) return;

      const updated = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(rulings)
          .where(eq(rulings.id, ruling.id))
          .for('update');
        if (!current || current.status !== RULING_STATUSES.ACTIVE) return null;
        const [after] = await tx
          .update(rulings)
          .set({ status: toStatus, updatedAt: new Date() })
          .where(eq(rulings.id, ruling.id))
          .returning();
        if (!after) throw new Error('Ruling status update returned no row.');
        await audit(tx, {
          ...auditContext(req),
          actionKey,
          entityType: AUDIT_ENTITIES.RULING,
          entityId: ruling.id,
          before: { status: current.status },
          after: { status: toStatus },
          reason: body.reason,
        });
        return after;
      });
      if (!updated) {
        res.status(409).json({ error: `Only active rulings can be ${toStatus}.` });
        return;
      }
      res.json(await loadRulingDetail(updated));
    } catch (error) {
      next(error);
    }
  };
}

rulingsRouter.post(
  '/:id/expunge',
  requireClaim(CLAIM_KEYS.COURT_EXPUNGE),
  moderationHandler(RULING_STATUSES.EXPUNGED, AUDIT_ACTIONS.RULING_EXPUNGE),
);

rulingsRouter.post(
  '/:id/pardon',
  requireClaim(CLAIM_KEYS.COURT_PARDON),
  moderationHandler(RULING_STATUSES.PARDONED, AUDIT_ACTIONS.RULING_PARDON),
);
