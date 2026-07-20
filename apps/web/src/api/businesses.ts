import type {
  BusinessDetailView,
  BusinessListItemView,
  BusinessListResponse,
  LicenseTypeView,
  OwnerLookupResponse,
} from '@aero/shared';

import { apiFetch } from './client';

/** Typed client for the business APIs (shared wire types from @aero/shared). */

export interface BusinessListFilters {
  q?: string;
  licensed?: boolean;
  page?: number;
  pageSize?: number;
}

export function fetchBusinesses(filters: BusinessListFilters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.licensed !== undefined) params.set('licensed', String(filters.licensed));
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  const query = params.toString();
  return apiFetch<BusinessListResponse>(`/api/businesses${query ? `?${query}` : ''}`);
}

export function fetchBusinessDetail(id: number | string) {
  return apiFetch<BusinessDetailView>(`/api/businesses/${id}`);
}

export function registerBusiness(payload: { name: string; ownerRobloxUserId: number }) {
  return apiFetch<BusinessDetailView>('/api/businesses', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateBusiness(id: number, payload: { name: string }) {
  return apiFetch<BusinessDetailView>(`/api/businesses/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function transferBusiness(
  id: number,
  payload: { toRobloxUserId: number; reason?: string },
) {
  return apiFetch<BusinessDetailView>(`/api/businesses/${id}/transfer`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function grantLicense(
  businessId: number,
  payload: { licenseTypeId: number; expiresAt?: string },
) {
  return apiFetch<BusinessDetailView>(`/api/businesses/${businessId}/licenses`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateLicense(
  businessId: number,
  licenseId: number,
  payload: { expiresAt: string | null },
) {
  return apiFetch<BusinessDetailView>(`/api/businesses/${businessId}/licenses/${licenseId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function revokeLicense(businessId: number, licenseId: number, reason: string) {
  return apiFetch<BusinessDetailView>(
    `/api/businesses/${businessId}/licenses/${licenseId}/revoke`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export function lookupOwners(q: string) {
  return apiFetch<OwnerLookupResponse>(
    `/api/businesses/owner-lookup?q=${encodeURIComponent(q)}`,
  );
}

export function fetchOwnedBusinesses(robloxUserId: number | string) {
  return apiFetch<{ items: BusinessListItemView[] }>(`/api/users/${robloxUserId}/businesses`);
}

// --- License-type vocabulary --------------------------------------------------

export function fetchLicenseTypes() {
  return apiFetch<LicenseTypeView[]>('/api/business-license-types');
}

export interface LicenseTypePayload {
  name: string;
  description?: string;
}

export function createLicenseType(payload: LicenseTypePayload) {
  return apiFetch<LicenseTypeView>('/api/business-license-types', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateLicenseType(id: number, payload: LicenseTypePayload) {
  return apiFetch<LicenseTypeView>(`/api/business-license-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteLicenseType(id: number) {
  return apiFetch<void>(`/api/business-license-types/${id}`, { method: 'DELETE' });
}
