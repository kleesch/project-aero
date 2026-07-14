import type { ClaimKey } from '../claims.js';
import type { RankComparison } from '../schemas/claims.js';
import type { UserRef } from '../users.js';

/**
 * Response shapes for the claim management API. Shared for the same reason
 * as the claim keys: the API builds these (`satisfies`-checked) and the
 * frontend consumes them, so the two can never drift. Timestamps are ISO
 * strings; people are `UserRef`s (see users.ts).
 */

export interface ClaimMappingView {
  id: number;
  groupId: number;
  comparison: RankComparison;
  rankValue: number;
}

export interface ClaimGrantView {
  id: number;
  user: UserRef;
  isNegative: boolean;
  reason: string;
  /** Null means the grant was a system action (e.g. the seed migration). */
  grantedBy: UserRef | null;
  grantedAt: string;
}

export interface AdminClaimView {
  key: ClaimKey;
  description: string;
  mappings: ClaimMappingView[];
  grants: ClaimGrantView[];
}

// --- User claim lookup ("why does X have Y") --------------------------------

export interface GroupMappingSourceView {
  type: 'group-mapping';
  mappingId: number;
  groupId: number;
  groupName: string | null;
  comparison: RankComparison;
  rankValue: number;
  userRank: number;
}

export interface DirectGrantSourceView {
  type: 'direct-grant';
  grantId: number;
  isNegative: boolean;
  reason: string;
  grantedBy: UserRef | null;
  grantedAt: string;
}

export interface AdminImpliedSourceView {
  type: 'admin-implied';
}

export type ClaimSourceView =
  GroupMappingSourceView | DirectGrantSourceView | AdminImpliedSourceView;

export interface UserClaimsLookupView {
  user: UserRef & {
    avatarUrl: string | null;
    lastLoginAt: string | null;
  };
  claims: ClaimKey[];
  resolved: { key: ClaimKey; sources: ClaimSourceView[] }[];
  blocked: {
    key: ClaimKey;
    blockedBy: DirectGrantSourceView;
    overriddenSources: ClaimSourceView[];
  }[];
}
