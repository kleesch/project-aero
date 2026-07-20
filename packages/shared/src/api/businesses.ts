import type { BusinessStatus, EffectiveLicenseStatus } from '../businesses.js';
import type { UserRef } from '../users.js';

/**
 * Response shapes for the business APIs (phase 06). Same contract rules as
 * the other APIs: ISO timestamps, people as `UserRef`s. The phase-05
 * `BusinessView` (api/courts.ts) stays for the ruling-party surfaces; these
 * are the full registration views.
 */

export interface LicenseTypeView {
  id: number;
  name: string;
  description: string | null;
}

export interface BusinessLicenseView {
  id: number;
  licenseType: LicenseTypeView;
  /** Derived: stored status plus expiry (`expired` is never stored). */
  status: EffectiveLicenseStatus;
  grantedBy: UserRef;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: UserRef | null;
  revokeReason: string | null;
}

/** One append-only ownership transfer log entry. */
export interface OwnershipTransferView {
  id: number;
  from: UserRef;
  to: UserRef;
  initiatedBy: UserRef;
  reason: string | null;
  transferredAt: string;
}

export interface BusinessListItemView {
  id: number;
  name: string;
  status: BusinessStatus;
  owner: UserRef;
  /** Names of currently effective (active, unexpired) licenses. */
  activeLicenses: string[];
  createdAt: string;
}

export interface BusinessListResponse {
  items: BusinessListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BusinessDetailView extends BusinessListItemView {
  createdBy: UserRef;
  licenses: BusinessLicenseView[];
  transfers: OwnershipTransferView[];
  updatedAt: string;
}

/** One typeahead hit from the owner lookup endpoint (registrar/transfer forms). */
export interface OwnerLookupUser {
  robloxUserId: number;
  username: string;
  displayName: string | null;
  /** False for stub rows fetched from ROBLOX for users who never logged in. */
  isPlatformUser: boolean;
}

export interface OwnerLookupResponse {
  users: OwnerLookupUser[];
}
