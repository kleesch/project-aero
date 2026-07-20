import {
  effectiveLicenseStatus,
  LICENSE_STATUSES,
  type BusinessDetailView,
  type BusinessLicenseView,
  type BusinessListItemView,
  type LicenseTypeView,
  type OwnershipTransferView,
} from '@aero/shared';
import { and, asc, eq, exists, gt, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Request } from 'express';

import { db } from '../db/client.js';
import {
  businessLicenses,
  businessLicenseTypes,
  businessOwnershipTransfers,
  businesses,
  users,
} from '../db/schema.js';
import { findRobloxUserById } from '../roblox/users.js';
import { auditContext } from './audit.js';
import { ensureStubUser } from './rulings.js';
import { loadUserRefs } from './user-refs.js';

/**
 * Business domain logic shared by the route handlers: reference validation,
 * the effective-license filter, and serialization of the wire views (see
 * DESIGN.md — Business).
 */

type BusinessRow = typeof businesses.$inferSelect;
type LicenseRow = typeof businessLicenses.$inferSelect;
type LicenseTypeRow = typeof businessLicenseTypes.$inferSelect;

/**
 * Ensures the referenced owner has a users row (required by foreign key),
 * stubbing people who never logged in on the fly — the same courtesy the
 * ruling party validation extends. Returns a user-facing message or null.
 */
export async function ensureOwnerUser(req: Request, robloxUserId: number): Promise<string | null> {
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

/** WHERE fragment: the license row is currently effective (active, unexpired). */
function licenseIsEffective(): SQL {
  return and(
    eq(businessLicenses.status, LICENSE_STATUSES.ACTIVE),
    or(isNull(businessLicenses.expiresAt), gt(businessLicenses.expiresAt, sql`now()`)),
  )!;
}

/** WHERE fragment for the directory's licensed/unlicensed filter. */
export function licensedWhere(licensed: boolean): SQL {
  const effectiveExists = exists(
    db
      .select({ one: sql`1` })
      .from(businessLicenses)
      .where(and(eq(businessLicenses.businessId, businesses.id), licenseIsEffective())),
  );
  return licensed ? effectiveExists : sql`NOT ${effectiveExists}`;
}

export function toLicenseTypeView(row: LicenseTypeRow): LicenseTypeView {
  return { id: row.id, name: row.name, description: row.description };
}

function toLicenseView(
  row: LicenseRow,
  licenseType: LicenseTypeRow,
  refs: Awaited<ReturnType<typeof loadUserRefs>>,
): BusinessLicenseView {
  return {
    id: row.id,
    licenseType: toLicenseTypeView(licenseType),
    status: effectiveLicenseStatus(row.status, row.expiresAt),
    grantedBy: refs(row.grantedBy),
    grantedAt: row.grantedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedBy: refs(row.revokedBy),
    revokeReason: row.revokeReason,
  };
}

/**
 * Batch serialization of businesses to list-item views: owner refs and the
 * names of currently effective licenses in a fixed number of queries.
 */
export async function loadBusinessListItems(rows: BusinessRow[]): Promise<BusinessListItemView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const licenseRows = await db
    .select({ businessId: businessLicenses.businessId, name: businessLicenseTypes.name })
    .from(businessLicenses)
    .innerJoin(businessLicenseTypes, eq(businessLicenses.licenseTypeId, businessLicenseTypes.id))
    .where(and(inArray(businessLicenses.businessId, ids), licenseIsEffective()))
    .orderBy(asc(businessLicenseTypes.name));

  const refs = await loadUserRefs(rows.map((row) => row.ownerUserId));

  const licensesByBusiness = new Map<number, string[]>(ids.map((id) => [id, []]));
  for (const row of licenseRows) licensesByBusiness.get(row.businessId)?.push(row.name);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    owner: refs(row.ownerUserId),
    activeLicenses: licensesByBusiness.get(row.id) ?? [],
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Loads and serializes the full detail view for one business. */
export async function loadBusinessDetail(business: BusinessRow): Promise<BusinessDetailView> {
  const [listItem] = await loadBusinessListItems([business]);
  if (!listItem) throw new Error('Business serialization returned no view.');

  const [licenseRows, transferRows] = await Promise.all([
    db
      .select({ license: businessLicenses, licenseType: businessLicenseTypes })
      .from(businessLicenses)
      .innerJoin(businessLicenseTypes, eq(businessLicenses.licenseTypeId, businessLicenseTypes.id))
      .where(eq(businessLicenses.businessId, business.id))
      .orderBy(asc(businessLicenses.grantedAt), asc(businessLicenses.id)),
    db
      .select()
      .from(businessOwnershipTransfers)
      .where(eq(businessOwnershipTransfers.businessId, business.id))
      .orderBy(asc(businessOwnershipTransfers.transferredAt), asc(businessOwnershipTransfers.id)),
  ]);

  const refs = await loadUserRefs([
    business.ownerUserId,
    business.createdBy,
    ...licenseRows.flatMap((row) => [row.license.grantedBy, row.license.revokedBy]),
    ...transferRows.flatMap((row) => [row.fromUserId, row.toUserId, row.initiatedBy]),
  ]);

  const transfers: OwnershipTransferView[] = transferRows.map((row) => ({
    id: row.id,
    from: refs(row.fromUserId),
    to: refs(row.toUserId),
    initiatedBy: refs(row.initiatedBy),
    reason: row.reason,
    transferredAt: row.transferredAt.toISOString(),
  }));

  return {
    ...listItem,
    owner: refs(business.ownerUserId),
    createdBy: refs(business.createdBy),
    licenses: licenseRows.map((row) => toLicenseView(row.license, row.licenseType, refs)),
    transfers,
    updatedAt: business.updatedAt.toISOString(),
  };
}
