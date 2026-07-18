import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  canViewNonActiveRulings,
  RULING_STATUSES,
  type AppealView,
  type BusinessRef,
  type OutcomeView,
  type RulingDetailView,
  type RulingListItemView,
  type RulingPartyInput,
  type RulingPartyView,
} from '@aero/shared';
import { asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Request } from 'express';

import { resolveUserClaims } from '../claims/resolution.js';
import { db } from '../db/client.js';
import {
  appealOutcomeLinks,
  appeals,
  businesses,
  documents,
  rulingOutcomeLinks,
  rulingOutcomes,
  rulingParties,
  rulings,
  users,
} from '../db/schema.js';
import { findRobloxUserById, type RobloxUser } from '../roblox/users.js';
import { audit, auditContext, type AuditEntry } from './audit.js';
import { toDocumentView } from './documents.js';
import { loadUserRefs } from './user-refs.js';

/**
 * Judicial domain logic shared by the route handlers: the visibility rule
 * for expunged/pardoned rulings, stub-user creation for the party lookup,
 * reference validation, and serialization of the wire views (see DESIGN.md —
 * Judicial).
 */

type RulingRow = typeof rulings.$inferSelect;

/**
 * Whether this request may see expunged/pardoned rulings (flagged): holders
 * of `court:submit` or `admin`, per the shared visibility rule. Anonymous
 * requests never resolve claims.
 */
export async function viewerSeesNonActiveRulings(req: Request): Promise<boolean> {
  if (!req.user) return false;
  const resolution = req.claims ?? (await resolveUserClaims(req.user.robloxUserId));
  req.claims = resolution;
  return canViewNonActiveRulings(resolution.claims);
}

/** WHERE fragment for the viewer's visibility; undefined means unrestricted. */
export function rulingVisibilityWhere(seesNonActive: boolean): SQL | undefined {
  return seesNonActive ? undefined : eq(rulings.status, RULING_STATUSES.ACTIVE);
}

/**
 * Inserts a stub users row for someone who has never logged in, so ruling
 * parties (and future record types) can reference them by foreign key. The
 * snapshot refreshes if they ever log in. Auditable, idempotent.
 */
export async function ensureStubUser(
  robloxUser: RobloxUser,
  auditCtx: Pick<AuditEntry, 'actorUserId' | 'requestIp'>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(users)
      .values({
        robloxUserId: robloxUser.robloxUserId,
        username: robloxUser.username,
        displayName: robloxUser.displayName,
      })
      .onConflictDoNothing()
      .returning({ robloxUserId: users.robloxUserId });
    if (inserted.length === 0) return;
    await audit(tx, {
      ...auditCtx,
      actionKey: AUDIT_ACTIONS.USER_STUB_CREATE,
      entityType: AUDIT_ENTITIES.USER,
      entityId: robloxUser.robloxUserId,
      after: { username: robloxUser.username, displayName: robloxUser.displayName },
    });
  });
}

/**
 * Validates the party references of a ruling submission: user parties must
 * have a users row (the lookup endpoint creates stubs), business parties an
 * existing business. Returns a user-facing message or null. As a courtesy,
 * unknown user ids are resolved against ROBLOX and stubbed on the fly, so a
 * judge pasting a raw id straight into the form still succeeds.
 */
export async function validateRulingParties(req: Request, parties: RulingPartyInput[]) {
  const userIds = [
    ...new Set(
      parties.flatMap((party) => (party.partyType === 'user' ? [party.robloxUserId] : [])),
    ),
  ];
  const businessIds = [
    ...new Set(
      parties.flatMap((party) => (party.partyType === 'business' ? [party.businessId] : [])),
    ),
  ];

  if (userIds.length > 0) {
    const known = await db
      .select({ id: users.robloxUserId })
      .from(users)
      .where(inArray(users.robloxUserId, userIds));
    const knownIds = new Set(known.map((row) => row.id));
    for (const id of userIds.filter((id) => !knownIds.has(id))) {
      const robloxUser = await findRobloxUserById(id);
      if (!robloxUser) return `ROBLOX user ${id} does not exist.`;
      await ensureStubUser(robloxUser, auditContext(req));
    }
  }
  if (businessIds.length > 0) {
    const known = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(inArray(businesses.id, businessIds));
    if (known.length !== businessIds.length) return 'One or more business ids do not exist.';
  }
  return null;
}

/** Validates that every referenced outcome id is in the vocabulary. */
export async function validateOutcomeIds(outcomeIds: number[]): Promise<string | null> {
  const known = await db
    .select({ id: rulingOutcomes.id })
    .from(rulingOutcomes)
    .where(inArray(rulingOutcomes.id, outcomeIds));
  return known.length === outcomeIds.length ? null : 'One or more outcome ids do not exist.';
}

export function toOutcomeView(row: typeof rulingOutcomes.$inferSelect): OutcomeView {
  return { id: row.id, name: row.name, description: row.description };
}

/**
 * Batch serialization of rulings to list-item views: parties, outcomes,
 * appeal presence, and user refs in a fixed number of queries regardless of
 * row count.
 */
export async function loadRulingListItems(rows: RulingRow[]): Promise<RulingListItemView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const [partyRows, outcomeRows, appealRows] = await Promise.all([
    db
      .select()
      .from(rulingParties)
      .where(inArray(rulingParties.rulingId, ids))
      .orderBy(asc(rulingParties.id)),
    db
      .select({
        rulingId: rulingOutcomeLinks.rulingId,
        outcome: rulingOutcomes,
      })
      .from(rulingOutcomeLinks)
      .innerJoin(rulingOutcomes, eq(rulingOutcomeLinks.outcomeId, rulingOutcomes.id))
      .where(inArray(rulingOutcomeLinks.rulingId, ids))
      .orderBy(asc(rulingOutcomes.name)),
    db.select({ rulingId: appeals.rulingId }).from(appeals).where(inArray(appeals.rulingId, ids)),
  ]);

  const businessIds = [
    ...new Set(partyRows.flatMap((row) => (row.businessId === null ? [] : [row.businessId]))),
  ];
  const businessRows = businessIds.length
    ? await db
        .select({ id: businesses.id, name: businesses.name })
        .from(businesses)
        .where(inArray(businesses.id, businessIds))
    : [];
  const businessById = new Map<number, BusinessRef>(businessRows.map((row) => [row.id, row]));

  const refs = await loadUserRefs([
    ...rows.map((row) => row.enteredBy),
    ...partyRows.flatMap((row) => (row.robloxUserId === null ? [] : [row.robloxUserId])),
  ]);

  const partiesByRuling = new Map<number, RulingPartyView[]>(ids.map((id) => [id, []]));
  for (const row of partyRows) {
    partiesByRuling.get(row.rulingId)?.push({
      id: row.id,
      side: row.side,
      partyType: row.partyType,
      user: row.robloxUserId === null ? null : refs(row.robloxUserId),
      business: row.businessId === null ? null : (businessById.get(row.businessId) ?? null),
    });
  }
  const outcomesByRuling = new Map<number, OutcomeView[]>(ids.map((id) => [id, []]));
  for (const row of outcomeRows) {
    outcomesByRuling.get(row.rulingId)?.push(toOutcomeView(row.outcome));
  }
  const appealed = new Set(appealRows.map((row) => row.rulingId));

  return rows.map((row) => ({
    id: row.id,
    rulingDate: row.rulingDate,
    status: row.status,
    enteredBy: refs(row.enteredBy),
    outcomes: outcomesByRuling.get(row.id) ?? [],
    parties: partiesByRuling.get(row.id) ?? [],
    hasAppeal: appealed.has(row.id),
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Loads and serializes the full detail view for one ruling. */
export async function loadRulingDetail(ruling: RulingRow): Promise<RulingDetailView> {
  const [listItem] = await loadRulingListItems([ruling]);
  if (!listItem) throw new Error('Ruling serialization returned no view.');

  const [[documentRow], [appealRow]] = await Promise.all([
    db.select().from(documents).where(eq(documents.id, ruling.documentId)),
    db
      .select({ appeal: appeals, document: documents })
      .from(appeals)
      .innerJoin(documents, eq(appeals.documentId, documents.id))
      .where(eq(appeals.rulingId, ruling.id)),
  ]);
  if (!documentRow) throw new Error(`Ruling ${ruling.id} references a missing document.`);

  let appeal: AppealView | null = null;
  if (appealRow) {
    const outcomeRows = await db
      .select({ outcome: rulingOutcomes })
      .from(appealOutcomeLinks)
      .innerJoin(rulingOutcomes, eq(appealOutcomeLinks.outcomeId, rulingOutcomes.id))
      .where(eq(appealOutcomeLinks.appealId, appealRow.appeal.id))
      .orderBy(asc(rulingOutcomes.name));
    const refs = await loadUserRefs([
      appealRow.appeal.enteredBy,
      appealRow.document.uploaderUserId,
      documentRow.uploaderUserId,
    ]);
    appeal = {
      id: appealRow.appeal.id,
      document: toDocumentView(appealRow.document, refs),
      enteredBy: refs(appealRow.appeal.enteredBy),
      enteredAt: appealRow.appeal.enteredAt.toISOString(),
      outcomes: outcomeRows.map((row) => toOutcomeView(row.outcome)),
    };
    return { ...listItem, document: toDocumentView(documentRow, refs), appeal };
  }

  const refs = await loadUserRefs([documentRow.uploaderUserId]);
  return { ...listItem, document: toDocumentView(documentRow, refs), appeal };
}

/** Escapes LIKE wildcards in user-supplied search text. */
export function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** `count(*)` helper reused by the list and court-record queries. */
export const countAll = sql<number>`count(*)::int`;
