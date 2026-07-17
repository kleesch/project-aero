import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  billListQuerySchema,
  billSubmitSchema,
  billTagsUpdateSchema,
  billTransitionSchema,
  billVersionCreateSchema,
  billVotesRecordSchema,
  BILL_STATUSES,
  BILL_STATUS_TRANSITIONS,
  CHAMBER_FOR_CODE,
  chamberForBillStage,
  CLAIM_KEYS,
  claimForBillTransition,
  isLegalBillTransition,
  isTerminalBillStatus,
  isVotingStage,
  parseBillId,
  STAGE_FOR_STATUS,
  voteUpdateClaimForChamber,
  type BillListResponse,
} from '@aero/shared';
import { and, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { Router, type Request, type Response } from 'express';

import { resolveUserClaims } from '../claims/resolution.js';
import { db } from '../db/client.js';
import {
  bills,
  billStageEvents,
  billTags,
  billVersions,
  billVotes,
  congressRosters,
  tags,
} from '../db/schema.js';
import { requireAuth, requireClaim } from '../middleware/claims.js';
import { audit, auditContext } from '../services/audit.js';
import {
  BillSequenceExhaustedError,
  deriveTally,
  findBillByRef,
  inferOriginChamber,
  loadBillDetail,
  loadBillTagViews,
  loadMemberRefs,
  submitBill,
  toBillListItemView,
  validateBillDocument,
} from '../services/bills.js';
import { guardBillSession } from '../services/session-rollover.js';
import { parseBody } from './helpers.js';

/**
 * The bill pipeline (see DESIGN.md — Bills), mounted at /api/bills. Reads are
 * public — anonymous users browse bills, votes, and PDFs; every mutation
 * carries its own claim gate, including the per-stage chamber claims the
 * transition and vote endpoints resolve dynamically.
 */
export const billsRouter = Router();

/** Resolves the :ref param (numeric or display id), answering 404 itself. */
async function loadBillParam(req: Request, res: Response) {
  const raw = req.params.ref;
  const bill = typeof raw === 'string' ? await findBillByRef(raw) : null;
  if (!bill) res.status(404).json({ error: 'No such bill.' });
  return bill;
}

/** 403 unless the actor holds the claim; admins may also correct vote tallies. */
async function actorHoldsClaim(
  req: Request,
  claim: string,
  options: { adminOverride?: boolean } = {},
): Promise<boolean> {
  const resolution = await resolveUserClaims(req.user!.robloxUserId);
  req.claims = resolution;
  const held = resolution.claims as readonly string[];
  return (
    held.includes(claim) || (options.adminOverride === true && held.includes(CLAIM_KEYS.ADMIN))
  );
}

// --- Public reads -----------------------------------------------------------

billsRouter.get('/', async (req, res, next) => {
  try {
    const query = billListQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: 'Invalid query.', issues: query.error.issues });
      return;
    }
    const { session, chamber, status, tags: tagFilter, q, page, pageSize } = query.data;

    const conditions = [];
    if (session !== undefined) conditions.push(eq(bills.session, session));
    if (chamber !== undefined) conditions.push(eq(bills.chamber, chamber === 'house' ? 'H' : 'S'));
    if (status !== undefined) conditions.push(eq(bills.status, status));
    if (tagFilter !== undefined && tagFilter.length > 0) {
      const tagged = db
        .select({ billId: billTags.billId })
        .from(billTags)
        .where(inArray(billTags.tagId, tagFilter))
        .groupBy(billTags.billId)
        .having(sql`count(distinct ${billTags.tagId}) = ${tagFilter.length}`);
      conditions.push(inArray(bills.id, tagged));
    }
    if (q !== undefined) {
      const parsed = parseBillId(q);
      if (parsed) {
        conditions.push(
          eq(bills.chamber, parsed.chamber),
          eq(bills.session, parsed.session),
          eq(bills.sequence, parsed.sequence),
        );
      } else {
        const escaped = q.replace(/[\\%_]/g, (char) => `\\${char}`);
        conditions.push(ilike(bills.title, `%${escaped}%`));
      }
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(bills)
      .where(where);
    const rows = await db
      .select()
      .from(bills)
      .where(where)
      .orderBy(desc(bills.createdAt), desc(bills.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [tagViews, refs] = await Promise.all([
      loadBillTagViews(rows.map((row) => row.id)),
      loadMemberRefs(rows.map((row) => row.submittedBy)),
    ]);
    res.json({
      items: rows.map((row) => toBillListItemView(row, tagViews.get(row.id) ?? [], refs)),
      total: countRow?.total ?? 0,
      page,
      pageSize,
    } satisfies BillListResponse);
  } catch (error) {
    next(error);
  }
});

billsRouter.get('/:ref', async (req, res, next) => {
  try {
    const bill = await loadBillParam(req, res);
    if (!bill) return;
    res.json(await loadBillDetail(bill));
  } catch (error) {
    next(error);
  }
});

// --- Submission -------------------------------------------------------------

billsRouter.post('/', requireClaim(CLAIM_KEYS.BILL_SUBMIT), async (req, res, next) => {
  try {
    const body = parseBody(billSubmitSchema, req, res);
    if (!body) return;

    const inference = await inferOriginChamber(req.user!.robloxUserId, body.chamber);
    if (!inference.ok) {
      res.status(422).json({ error: inference.error });
      return;
    }
    const documentProblem = await validateBillDocument(body.documentId, req.user!.robloxUserId);
    if (documentProblem) {
      res.status(422).json({ error: documentProblem });
      return;
    }
    if (body.tagIds.length > 0) {
      const known = await db
        .select({ id: tags.id })
        .from(tags)
        .where(inArray(tags.id, body.tagIds));
      if (known.length !== body.tagIds.length) {
        res.status(422).json({ error: 'One or more tag ids do not exist.' });
        return;
      }
    }

    const bill = await submitBill({
      submitterUserId: req.user!.robloxUserId,
      title: body.title,
      documentId: body.documentId,
      chamber: inference.chamber,
      tagIds: body.tagIds,
      requestIp: req.ip ?? null,
    });
    res.status(201).json(await loadBillDetail(bill));
  } catch (error) {
    if (error instanceof BillSequenceExhaustedError) {
      res.status(422).json({ error: error.message });
      return;
    }
    next(error);
  }
});

// --- Stage transitions ------------------------------------------------------

billsRouter.post('/:ref/transition', requireAuth, async (req, res, next) => {
  try {
    const bill = await loadBillParam(req, res);
    if (!bill) return;
    const body = parseBody(billTransitionSchema, req, res);
    if (!body) return;

    if (await guardBillSession(bill)) {
      res.status(409).json({ error: 'This bill died at session rollover; it cannot advance.' });
      return;
    }
    if (body.toStatus === BILL_STATUSES.DIED_IN_SESSION) {
      res.status(422).json({ error: 'DIED_IN_SESSION is declared by the system, not by users.' });
      return;
    }
    if (!isLegalBillTransition(bill.status, body.toStatus)) {
      res.status(409).json({
        error: `A bill in ${bill.status} cannot move to ${body.toStatus}.`,
        legalNextStatuses: BILL_STATUS_TRANSITIONS[bill.status],
      });
      return;
    }
    const requiredClaim = claimForBillTransition(bill.status, CHAMBER_FOR_CODE[bill.chamber]);
    if (!requiredClaim || !(await actorHoldsClaim(req, requiredClaim))) {
      res.status(403).json({ error: `Missing required claim: ${requiredClaim ?? 'none'}` });
      return;
    }

    const transitioned = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(bills).where(eq(bills.id, bill.id)).for('update');
      if (!current || !isLegalBillTransition(current.status, body.toStatus)) return null;
      const [updated] = await tx
        .update(bills)
        .set({ status: body.toStatus, updatedAt: new Date() })
        .where(eq(bills.id, bill.id))
        .returning();
      if (!updated) throw new Error('Bill status update returned no row.');
      const [event] = await tx
        .insert(billStageEvents)
        .values({
          billId: bill.id,
          // A legal transition never starts from a terminal status.
          stage: STAGE_FOR_STATUS[current.status]!,
          outcome: body.toStatus,
          decidedBy: req.user!.robloxUserId,
          notes: body.notes ?? null,
        })
        .returning();
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.BILL_STAGE_TRANSITION,
        entityType: AUDIT_ENTITIES.BILL,
        entityId: bill.id,
        before: { status: current.status },
        after: { status: body.toStatus, stageEventId: event?.id, notes: body.notes ?? null },
      });
      return updated;
    });
    if (!transitioned) {
      res.status(409).json({ error: 'The bill changed status concurrently; reload and retry.' });
      return;
    }
    res.json(await loadBillDetail(transitioned));
  } catch (error) {
    next(error);
  }
});

// --- PDF versions -----------------------------------------------------------

billsRouter.post('/:ref/versions', requireClaim(CLAIM_KEYS.BILL_SUBMIT), async (req, res, next) => {
  try {
    const bill = await loadBillParam(req, res);
    if (!bill) return;
    const body = parseBody(billVersionCreateSchema, req, res);
    if (!body) return;

    if (await guardBillSession(bill)) {
      res.status(409).json({ error: 'This bill died at session rollover.' });
      return;
    }
    if (isTerminalBillStatus(bill.status)) {
      res.status(409).json({ error: 'A settled bill cannot receive new versions.' });
      return;
    }
    const documentProblem = await validateBillDocument(body.documentId, req.user!.robloxUserId);
    if (documentProblem) {
      res.status(422).json({ error: documentProblem });
      return;
    }

    await db.transaction(async (tx) => {
      // The bill row lock serializes version numbering.
      await tx.select().from(bills).where(eq(bills.id, bill.id)).for('update');
      const [maxRow] = await tx
        .select({
          nextVersion: sql<number>`coalesce(max(${billVersions.versionNo}), 0)::int + 1`,
        })
        .from(billVersions)
        .where(eq(billVersions.billId, bill.id));
      const nextVersion = maxRow?.nextVersion ?? 1;
      await tx.insert(billVersions).values({
        billId: bill.id,
        versionNo: nextVersion,
        documentId: body.documentId,
        uploadedBy: req.user!.robloxUserId,
      });
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.BILL_VERSION_UPLOAD,
        entityType: AUDIT_ENTITIES.BILL,
        entityId: bill.id,
        after: { versionNo: nextVersion, documentId: body.documentId },
      });
    });
    res.status(201).json(await loadBillDetail(bill));
  } catch (error) {
    next(error);
  }
});

// --- Tags on a bill ---------------------------------------------------------

billsRouter.put('/:ref/tags', requireClaim(CLAIM_KEYS.BILL_SUBMIT), async (req, res, next) => {
  try {
    const bill = await loadBillParam(req, res);
    if (!bill) return;
    const body = parseBody(billTagsUpdateSchema, req, res);
    if (!body) return;

    // Categorization stays editable on settled bills, but an expired bill
    // still gets killed the moment anyone touches it (the lazy guard).
    await guardBillSession(bill);

    if (body.tagIds.length > 0) {
      const known = await db
        .select({ id: tags.id })
        .from(tags)
        .where(inArray(tags.id, body.tagIds));
      if (known.length !== body.tagIds.length) {
        res.status(422).json({ error: 'One or more tag ids do not exist.' });
        return;
      }
    }

    await db.transaction(async (tx) => {
      const before = await tx
        .select({ tagId: billTags.tagId })
        .from(billTags)
        .where(eq(billTags.billId, bill.id));
      await tx.delete(billTags).where(eq(billTags.billId, bill.id));
      if (body.tagIds.length > 0) {
        await tx.insert(billTags).values(body.tagIds.map((tagId) => ({ billId: bill.id, tagId })));
      }
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.BILL_TAGS_UPDATE,
        entityType: AUDIT_ENTITIES.BILL,
        entityId: bill.id,
        before: { tagIds: before.map((row) => row.tagId) },
        after: { tagIds: body.tagIds },
      });
    });
    const tagViews = await loadBillTagViews([bill.id]);
    res.json(tagViews.get(bill.id) ?? []);
  } catch (error) {
    next(error);
  }
});

// --- Votes ------------------------------------------------------------------

billsRouter.post('/:ref/stage-events/:eventId/votes', requireAuth, async (req, res, next) => {
  try {
    const bill = await loadBillParam(req, res);
    if (!bill) return;
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      res.status(400).json({ error: 'Invalid stage event id.' });
      return;
    }
    const [event] = await db
      .select()
      .from(billStageEvents)
      .where(and(eq(billStageEvents.id, eventId), eq(billStageEvents.billId, bill.id)));
    if (!event) {
      res.status(404).json({ error: 'No such stage event on this bill.' });
      return;
    }
    if (!isVotingStage(event.stage)) {
      res.status(422).json({ error: 'Presidential action records no per-member votes.' });
      return;
    }
    const body = parseBody(billVotesRecordSchema, req, res);
    if (!body) return;

    // Recording is documentation of what happened, so it stays possible on
    // settled bills (and admins may correct any tally) — but touching an
    // expired bill still triggers the lazy session kill.
    await guardBillSession(bill);

    const chamber = chamberForBillStage(event.stage, CHAMBER_FOR_CODE[bill.chamber])!;
    const requiredClaim = voteUpdateClaimForChamber(chamber);
    if (!(await actorHoldsClaim(req, requiredClaim, { adminOverride: true }))) {
      res.status(403).json({ error: `Missing required claim: ${requiredClaim}` });
      return;
    }

    const roster = await db
      .select({ robloxUserId: congressRosters.robloxUserId })
      .from(congressRosters)
      .where(and(eq(congressRosters.chamber, chamber), eq(congressRosters.active, true)));
    const rosterIds = new Set(roster.map((row) => row.robloxUserId));
    const offRoster = body.votes
      .map((vote) => vote.robloxUserId)
      .filter((id) => !rosterIds.has(id));
    if (offRoster.length > 0 && !body.confirmOffRoster) {
      res.status(422).json({
        error:
          'Some members are not on the active roster (it may lag reality); ' +
          'resubmit with confirmOffRoster to record them anyway.',
        offRosterUserIds: offRoster,
      });
      return;
    }

    const summary = await db.transaction(async (tx) => {
      // The stage-event row lock serializes all vote writes for the event,
      // which is what keeps "one live vote per member" true without a
      // deferred constraint.
      await tx
        .select({ id: billStageEvents.id })
        .from(billStageEvents)
        .where(eq(billStageEvents.id, event.id))
        .for('update');
      const liveRows = await tx
        .select()
        .from(billVotes)
        .where(and(eq(billVotes.stageEventId, event.id), isNull(billVotes.supersededBy)));
      const liveByMember = new Map(liveRows.map((row) => [row.robloxUserId, row]));
      const beforeTally = deriveTally(liveRows.map((row) => row.position));

      let recorded = 0;
      let superseded = 0;
      for (const entry of body.votes) {
        const existing = liveByMember.get(entry.robloxUserId);
        if (existing && existing.position === entry.position) continue;
        const [inserted] = await tx
          .insert(billVotes)
          .values({
            stageEventId: event.id,
            robloxUserId: entry.robloxUserId,
            position: entry.position,
            recordedBy: req.user!.robloxUserId,
          })
          .returning({ id: billVotes.id });
        if (!inserted) throw new Error('Vote insert returned no row.');
        recorded += 1;
        if (existing) {
          await tx
            .update(billVotes)
            .set({ supersededBy: inserted.id })
            .where(eq(billVotes.id, existing.id));
          superseded += 1;
        }
      }

      const afterRows = await tx
        .select({ position: billVotes.position })
        .from(billVotes)
        .where(and(eq(billVotes.stageEventId, event.id), isNull(billVotes.supersededBy)));
      const afterTally = deriveTally(afterRows.map((row) => row.position));

      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.BILL_VOTES_RECORD,
        entityType: AUDIT_ENTITIES.BILL,
        entityId: bill.id,
        before: { stageEventId: event.id, tally: beforeTally },
        after: {
          stageEventId: event.id,
          tally: afterTally,
          recorded,
          superseded,
          offRosterUserIds: offRoster,
        },
      });
      return { recorded, superseded };
    });

    const detail = await loadBillDetail(bill);
    res.json({
      ...summary,
      stageEvent: detail.stageEvents.find((stageEvent) => stageEvent.id === event.id) ?? null,
    });
  } catch (error) {
    next(error);
  }
});
