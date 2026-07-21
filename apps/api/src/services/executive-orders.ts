import {
  effectiveEoStatus,
  EO_STATUSES,
  type EffectiveEoStatus,
  type ExecutiveOrderDetailView,
  type ExecutiveOrderListItemView,
  type ExecutiveOrderRef,
} from '@aero/shared';
import { and, eq, gt, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Request } from 'express';

import { db } from '../db/client.js';
import { documents, executiveOrders, users } from '../db/schema.js';
import { findRobloxUserById } from '../roblox/users.js';
import { auditContext } from './audit.js';
import { toDocumentView } from './documents.js';
import { ensureStubUser } from './rulings.js';
import { loadUserRefs } from './user-refs.js';

/**
 * Executive Order domain logic shared by the route handlers: issuer
 * validation, the effective-status filter, next-number suggestion, and
 * serialization of the wire views (see PROJECT.md — Executive Orders).
 */

type EoRow = typeof executiveOrders.$inferSelect;

/**
 * Ensures the issuing president has a users row (required by foreign key),
 * stubbing people who never logged in — the same courtesy ruling parties and
 * business owners get. Returns a user-facing message or null.
 */
export async function ensureIssuerUser(req: Request, robloxUserId: number): Promise<string | null> {
  const [known] = await db
    .select({ id: users.robloxUserId })
    .from(users)
    .where(eq(users.robloxUserId, robloxUserId));
  if (known) return null;
  const robloxUser = await findRobloxUserById(robloxUserId);
  if (!robloxUser) return `ROBLOX user ${robloxUserId} does not exist.`;
  await ensureStubUser(robloxUser, auditContext(req));
  return null;
}

/** The suggested next EO number: current max + 1 (1 when the archive is empty). */
export async function nextEoNumber(): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${executiveOrders.eoNumber})` })
    .from(executiveOrders);
  return (row?.max ?? 0) + 1;
}

/** WHERE fragment for the directory's effective-status filter (incl. derived `expired`). */
export function effectiveStatusWhere(status: EffectiveEoStatus): SQL {
  switch (status) {
    case 'active':
      return and(
        eq(executiveOrders.status, EO_STATUSES.ACTIVE),
        or(isNull(executiveOrders.expiresAt), gt(executiveOrders.expiresAt, sql`now()`)),
      )!;
    case 'expired':
      return and(
        eq(executiveOrders.status, EO_STATUSES.ACTIVE),
        lte(executiveOrders.expiresAt, sql`now()`),
      )!;
    case 'repealed':
      return eq(executiveOrders.status, EO_STATUSES.REPEALED);
    case 'superseded':
      return eq(executiveOrders.status, EO_STATUSES.SUPERSEDED);
  }
}

function toListItem(
  row: EoRow,
  refs: Awaited<ReturnType<typeof loadUserRefs>>,
): ExecutiveOrderListItemView {
  return {
    id: row.id,
    eoNumber: row.eoNumber,
    title: row.title,
    status: effectiveEoStatus(row.status, row.expiresAt),
    issuedBy: refs(row.issuedBy),
    effectiveDate: row.effectiveDate,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    hasSummary: row.summary !== null && row.summary.trim().length > 0,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Batch serialization of orders to list-item views (owner refs in one query). */
export async function loadEoListItems(rows: EoRow[]): Promise<ExecutiveOrderListItemView[]> {
  if (rows.length === 0) return [];
  const refs = await loadUserRefs(rows.map((row) => row.issuedBy));
  return rows.map((row) => toListItem(row, refs));
}

function toRef(row: EoRow): ExecutiveOrderRef {
  return {
    id: row.id,
    eoNumber: row.eoNumber,
    title: row.title,
    status: effectiveEoStatus(row.status, row.expiresAt),
  };
}

/** Loads and serializes the full detail view for one order, with cross-links. */
export async function loadEoDetail(order: EoRow): Promise<ExecutiveOrderDetailView> {
  // Forward links (orders this one points at) + reverse links (orders pointing
  // back at this one) are all executive_orders rows; fetch the lot in one query.
  const linkIds = [order.repealedByEoId, order.supersededByEoId].filter(
    (id): id is number => id !== null,
  );
  const [documentRow] = await db.select().from(documents).where(eq(documents.id, order.documentId));
  if (!documentRow) throw new Error(`EO ${order.id} references a missing document.`);

  const [forwardRows, reverseRows] = await Promise.all([
    linkIds.length
      ? db.select().from(executiveOrders).where(inArray(executiveOrders.id, linkIds))
      : Promise.resolve([] as EoRow[]),
    db
      .select()
      .from(executiveOrders)
      .where(
        or(
          eq(executiveOrders.repealedByEoId, order.id),
          eq(executiveOrders.supersededByEoId, order.id),
        ),
      ),
  ]);

  const forwardById = new Map(forwardRows.map((row) => [row.id, row]));
  const repealedBy = order.repealedByEoId ? forwardById.get(order.repealedByEoId) : undefined;
  const supersededBy = order.supersededByEoId ? forwardById.get(order.supersededByEoId) : undefined;
  const repeals = reverseRows.find((row) => row.repealedByEoId === order.id);
  const supersedes = reverseRows.find((row) => row.supersededByEoId === order.id);

  const refs = await loadUserRefs([
    order.issuedBy,
    order.createdBy,
    documentRow.uploaderUserId,
  ]);

  return {
    ...toListItem(order, refs),
    summary: order.summary,
    document: toDocumentView(documentRow, refs),
    createdBy: refs(order.createdBy),
    repeals: repeals ? toRef(repeals) : null,
    supersedes: supersedes ? toRef(supersedes) : null,
    repealedBy: repealedBy ? toRef(repealedBy) : null,
    supersededBy: supersededBy ? toRef(supersededBy) : null,
    updatedAt: order.updatedAt.toISOString(),
  };
}
