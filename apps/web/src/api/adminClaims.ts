import type {
  ClaimKey,
  DirectClaimGrantCreate,
  GroupClaimMappingCreate,
  RankComparison,
} from '@aero/shared';

import { apiFetch } from './client';

/** Typed client for the claim management API (all gated by claims:manage). */

export interface ClaimMapping {
  id: number;
  groupId: number;
  comparison: RankComparison;
  rankValue: number;
}

export interface ClaimGrant {
  id: number;
  userId: number;
  username: string | null;
  isNegative: boolean;
  reason: string;
  grantedBy: number | null;
  grantedByUsername: string | null;
  grantedAt: string;
}

export interface AdminClaim {
  key: ClaimKey;
  description: string;
  mappings: ClaimMapping[];
  grants: ClaimGrant[];
}

export type ClaimSource =
  | {
      type: 'group-mapping';
      mappingId: number;
      groupId: number;
      groupName: string | null;
      comparison: RankComparison;
      rankValue: number;
      userRank: number;
    }
  | {
      type: 'direct-grant';
      grantId: number;
      isNegative: boolean;
      reason: string;
      grantedBy: number | null;
      grantedAt: string;
    }
  | { type: 'admin-implied' };

export interface UserClaimsLookup {
  user: {
    robloxUserId: number;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    lastLoginAt: string | null;
  };
  claims: ClaimKey[];
  resolved: { key: ClaimKey; sources: ClaimSource[] }[];
  blocked: { key: ClaimKey; blockedBy: ClaimSource; overriddenSources: ClaimSource[] }[];
}

export function fetchAdminClaims() {
  return apiFetch<AdminClaim[]>('/api/admin/claims');
}

export function createMapping(claimKey: ClaimKey, body: GroupClaimMappingCreate) {
  return apiFetch<ClaimMapping>(`/api/admin/claims/${encodeURIComponent(claimKey)}/mappings`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteMapping(id: number) {
  return apiFetch<void>(`/api/admin/mappings/${id}`, { method: 'DELETE' });
}

export function createGrant(body: DirectClaimGrantCreate) {
  return apiFetch<ClaimGrant>('/api/admin/grants', { method: 'POST', body: JSON.stringify(body) });
}

export function revokeGrant(id: number, reason: string) {
  return apiFetch<ClaimGrant>(`/api/admin/grants/${id}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function lookupUserClaims(query: string) {
  return apiFetch<UserClaimsLookup>(`/api/admin/users/${encodeURIComponent(query)}/claims`);
}
