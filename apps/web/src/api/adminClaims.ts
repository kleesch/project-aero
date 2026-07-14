import type {
  AdminClaimView,
  ClaimGrantView,
  ClaimKey,
  ClaimMappingView,
  DirectClaimGrantCreate,
  GroupClaimMappingCreate,
  UserClaimsLookupView,
} from '@aero/shared';

import { apiFetch } from './client';

/**
 * Typed client for the claim management API (all gated by claims:manage).
 * Response shapes are the shared wire types (@aero/shared api/claims.ts),
 * the same ones the API satisfies-checks against.
 */

export function fetchAdminClaims() {
  return apiFetch<AdminClaimView[]>('/api/admin/claims');
}

export function createMapping(claimKey: ClaimKey, body: GroupClaimMappingCreate) {
  return apiFetch<ClaimMappingView>(`/api/admin/claims/${encodeURIComponent(claimKey)}/mappings`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteMapping(id: number) {
  return apiFetch<void>(`/api/admin/mappings/${id}`, { method: 'DELETE' });
}

export function createGrant(body: DirectClaimGrantCreate) {
  return apiFetch<ClaimGrantView>('/api/admin/grants', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function revokeGrant(id: number, reason: string) {
  return apiFetch<ClaimGrantView>(`/api/admin/grants/${id}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function lookupUserClaims(query: string) {
  return apiFetch<UserClaimsLookupView>(`/api/admin/users/${encodeURIComponent(query)}/claims`);
}
