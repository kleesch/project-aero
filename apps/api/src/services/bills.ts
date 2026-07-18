import {
  ALL_VOTE_POSITIONS,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  BILL_STATUS_TRANSITIONS,
  BILL_STATUSES,
  CHAMBER_CODES,
  CHAMBER_FOR_CODE,
  formatBillId,
  isVotingStage,
  parseBillId,
  sessionForDate,
  type BillDetailView,
  type BillListItemView,
  type BillStageEventView,
  type BillVersionView,
  type BillVoteView,
  type Chamber,
  type ChamberCode,
  type TagView,
  type UserRef,
  type VoteTally,
} from '@aero/shared';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db, type DbTransaction } from '../db/client.js';
import {
  bills,
  billSequenceCounters,
  billStageEvents,
  billTags,
  billVersions,
  billVotes,
  congressRosters,
  documents,
  tags,
} from '../db/schema.js';
import { audit } from './audit.js';
import { toDocumentView, validateAttachableDocument } from './documents.js';
import { loadUserRefs, type UserRefLookup } from './user-refs.js';

/**
 * Bill domain logic shared by the route handlers: transactional sequence
 * assignment, origin-chamber inference, and serialization of the wire views
 * (see DESIGN.md — Bills).
 */

type BillRow = typeof bills.$inferSelect;

/** A session produced its 100th bill for a chamber — the spec caps at 99. */
export class BillSequenceExhaustedError extends Error {
  constructor(chamber: ChamberCode, session: number) {
    super(
      `Session ${session} already has 99 ${chamber === 'H' ? 'House' : 'Senate'} bills; ` +
        'the identifier format allows no more this session.',
    );
    this.name = 'BillSequenceExhaustedError';
  }
}

/**
 * Claims the next sequence for `(chamber, session)` inside the caller's
 * transaction. The counter-row upsert takes a row lock, so concurrent
 * submissions serialize here and can never collide on the unique index.
 */
export async function assignNextSequence(
  tx: DbTransaction,
  chamber: ChamberCode,
  session: number,
): Promise<number> {
  const [row] = await tx
    .insert(billSequenceCounters)
    .values({ chamber, session, lastSequence: 1 })
    .onConflictDoUpdate({
      target: [billSequenceCounters.chamber, billSequenceCounters.session],
      set: { lastSequence: sql`${billSequenceCounters.lastSequence} + 1` },
    })
    .returning({ lastSequence: billSequenceCounters.lastSequence });
  if (!row) throw new Error('Sequence counter upsert returned no row.');
  if (row.lastSequence > 99) throw new BillSequenceExhaustedError(chamber, session);
  return row.lastSequence;
}

export type ChamberInference = { ok: true; chamber: Chamber } | { ok: false; error: string };

/**
 * Determines a submission's origin chamber from the submitter's active roster
 * membership; an explicit chamber is only needed — and only honored — to
 * disambiguate someone sitting in both.
 */
export async function inferOriginChamber(
  submitterUserId: number,
  explicit: Chamber | undefined,
): Promise<ChamberInference> {
  const memberships = await db
    .select({ chamber: congressRosters.chamber })
    .from(congressRosters)
    .where(
      and(eq(congressRosters.robloxUserId, submitterUserId), eq(congressRosters.active, true)),
    );
  const chambers = [...new Set(memberships.map((row) => row.chamber))];

  if (chambers.length === 0) {
    return {
      ok: false,
      error:
        'You are not on an active congressional roster; bills must originate from a chamber member.',
    };
  }
  if (explicit) {
    if (!chambers.includes(explicit)) {
      return { ok: false, error: `You are not an active member of the ${explicit}.` };
    }
    return { ok: true, chamber: explicit };
  }
  if (chambers.length > 1) {
    return {
      ok: false,
      error: 'You sit on both rosters; specify the chamber this bill originates in.',
    };
  }
  return { ok: true, chamber: chambers[0]! };
}

export interface SubmitBillInput {
  submitterUserId: number;
  title: string;
  documentId: string;
  chamber: Chamber;
  tagIds: number[];
  requestIp: string | null;
}

/**
 * Creates the bill, its version 1, and its tags in one transaction. The
 * session is computed at insert time (shared math); the sequence comes from
 * the counter row, so a failure anywhere assigns no identifier.
 */
export async function submitBill(input: SubmitBillInput): Promise<BillRow> {
  const chamberCode = CHAMBER_CODES[input.chamber];
  const session = sessionForDate(new Date());

  return db.transaction(async (tx) => {
    const sequence = await assignNextSequence(tx, chamberCode, session);
    const [bill] = await tx
      .insert(bills)
      .values({
        chamber: chamberCode,
        session,
        sequence,
        title: input.title,
        status: BILL_STATUSES.IN_COMMITTEE,
        submittedBy: input.submitterUserId,
      })
      .returning();
    if (!bill) throw new Error('Bill insert returned no row.');

    await tx.insert(billVersions).values({
      billId: bill.id,
      versionNo: 1,
      documentId: input.documentId,
      uploadedBy: input.submitterUserId,
    });
    if (input.tagIds.length > 0) {
      await tx.insert(billTags).values(input.tagIds.map((tagId) => ({ billId: bill.id, tagId })));
    }

    await audit(tx, {
      actorUserId: input.submitterUserId,
      actionKey: AUDIT_ACTIONS.BILL_SUBMIT,
      entityType: AUDIT_ENTITIES.BILL,
      entityId: bill.id,
      after: {
        ...bill,
        displayId: formatBillId(bill.chamber, bill.session, bill.sequence),
        documentId: input.documentId,
        tagIds: input.tagIds,
      },
      requestIp: input.requestIp,
    });
    return bill;
  });
}

/**
 * Resolves a bill by numeric id or display id (`/bills/HB8401`). Display ids
 * are derived, so lookups translate back to `(chamber, session, sequence)`.
 */
export async function findBillByRef(ref: string): Promise<BillRow | null> {
  if (/^\d+$/.test(ref)) {
    const [row] = await db
      .select()
      .from(bills)
      .where(eq(bills.id, Number(ref)));
    return row ?? null;
  }
  const parsed = parseBillId(ref);
  if (!parsed) return null;
  const [row] = await db
    .select()
    .from(bills)
    .where(
      and(
        eq(bills.chamber, parsed.chamber),
        eq(bills.session, parsed.session),
        eq(bills.sequence, parsed.sequence),
      ),
    );
  return row ?? null;
}

/** Guards a bill mutation against a document another user uploaded, or a quarantined one. */
export async function validateBillDocument(
  documentId: string,
  actorUserId: number,
): Promise<string | null> {
  return validateAttachableDocument(documentId, actorUserId);
}

export function emptyTally(): VoteTally {
  return { yea: 0, nay: 0, abstain: 0, absent: 0 };
}

export function deriveTally(positions: Iterable<string>): VoteTally {
  const tally = emptyTally();
  for (const position of positions) {
    if ((ALL_VOTE_POSITIONS as readonly string[]).includes(position)) {
      tally[position as keyof VoteTally] += 1;
    }
  }
  return tally;
}

/**
 * UserRef hydration for Congress members, who need not be platform users:
 * the users snapshot wins, the roster username snapshot fills the gaps.
 */
export async function loadMemberRefs(ids: Iterable<number>): Promise<UserRefLookup> {
  const wanted = [...new Set(ids)];
  const refs = await loadUserRefs(wanted);
  const missing = wanted.filter((id) => refs(id).username === null);
  const snapshots = missing.length
    ? await db
        .select({
          robloxUserId: congressRosters.robloxUserId,
          username: congressRosters.usernameSnapshot,
        })
        .from(congressRosters)
        .where(inArray(congressRosters.robloxUserId, missing))
    : [];
  const snapshotById = new Map(snapshots.map((row) => [row.robloxUserId, row.username]));

  return ((id: number | null | undefined) => {
    const ref = refs(id);
    if (ref === null || ref.username !== null) return ref;
    return { ...ref, username: snapshotById.get(ref.robloxUserId) ?? null };
  }) as UserRefLookup;
}

/** Tags per bill for a set of bills, one query. */
export async function loadBillTagViews(billIds: number[]): Promise<Map<number, TagView[]>> {
  const byBill = new Map<number, TagView[]>(billIds.map((id) => [id, []]));
  if (billIds.length === 0) return byBill;
  const rows = await db
    .select({
      billId: billTags.billId,
      id: tags.id,
      name: tags.name,
      description: tags.description,
    })
    .from(billTags)
    .innerJoin(tags, eq(billTags.tagId, tags.id))
    .where(inArray(billTags.billId, billIds))
    .orderBy(asc(tags.name));
  for (const row of rows) {
    byBill.get(row.billId)?.push({ id: row.id, name: row.name, description: row.description });
  }
  return byBill;
}

export function toBillListItemView(
  bill: BillRow,
  tagViews: TagView[],
  refs: (id: number) => UserRef,
): BillListItemView {
  return {
    id: bill.id,
    displayId: formatBillId(bill.chamber, bill.session, bill.sequence),
    chamber: CHAMBER_FOR_CODE[bill.chamber],
    session: bill.session,
    sequence: bill.sequence,
    title: bill.title,
    status: bill.status,
    submittedBy: refs(bill.submittedBy),
    tags: tagViews,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
  };
}

/** Loads and serializes the full detail view for one bill. */
export async function loadBillDetail(bill: BillRow): Promise<BillDetailView> {
  const [versionRows, eventRows, tagViews] = await Promise.all([
    db
      .select({ version: billVersions, document: documents })
      .from(billVersions)
      .innerJoin(documents, eq(billVersions.documentId, documents.id))
      .where(eq(billVersions.billId, bill.id))
      .orderBy(asc(billVersions.versionNo)),
    db
      .select()
      .from(billStageEvents)
      .where(eq(billStageEvents.billId, bill.id))
      .orderBy(asc(billStageEvents.decidedAt), asc(billStageEvents.id)),
    loadBillTagViews([bill.id]),
  ]);

  const voteRows = eventRows.length
    ? await db
        .select()
        .from(billVotes)
        .where(
          and(
            inArray(
              billVotes.stageEventId,
              eventRows.map((event) => event.id),
            ),
            isNull(billVotes.supersededBy),
          ),
        )
        .orderBy(asc(billVotes.robloxUserId))
    : [];

  const memberRefs = await loadMemberRefs([
    bill.submittedBy,
    ...versionRows.flatMap((row) => [row.version.uploadedBy, row.document.uploaderUserId]),
    ...eventRows.flatMap((event) => (event.decidedBy === null ? [] : [event.decidedBy])),
    ...voteRows.flatMap((vote) => [vote.robloxUserId, vote.recordedBy]),
  ]);

  const votesByEvent = new Map<number, BillVoteView[]>();
  for (const vote of voteRows) {
    const view: BillVoteView = {
      member: memberRefs(vote.robloxUserId),
      position: vote.position,
      recordedBy: memberRefs(vote.recordedBy),
      recordedAt: vote.recordedAt.toISOString(),
    };
    const list = votesByEvent.get(vote.stageEventId);
    if (list) list.push(view);
    else votesByEvent.set(vote.stageEventId, [view]);
  }

  const stageEvents: BillStageEventView[] = eventRows.map((event) => {
    const votes = votesByEvent.get(event.id) ?? [];
    return {
      id: event.id,
      stage: event.stage,
      outcome: event.outcome,
      decidedBy: memberRefs(event.decidedBy),
      decidedAt: event.decidedAt.toISOString(),
      notes: event.notes,
      acceptsVotes: isVotingStage(event.stage),
      votes,
      tally: deriveTally(votes.map((vote) => vote.position)),
    };
  });

  const versions: BillVersionView[] = versionRows.map((row) => ({
    versionNo: row.version.versionNo,
    document: toDocumentView(row.document, memberRefs),
    uploadedBy: memberRefs(row.version.uploadedBy),
    createdAt: row.version.createdAt.toISOString(),
  }));

  return {
    ...toBillListItemView(bill, tagViews.get(bill.id) ?? [], memberRefs),
    versions,
    stageEvents,
    // The UI offers only outcomes someone can declare; death is system-only.
    legalNextStatuses: BILL_STATUS_TRANSITIONS[bill.status].filter(
      (status) => status !== BILL_STATUSES.DIED_IN_SESSION,
    ),
  };
}
