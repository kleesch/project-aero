import type {
  BusinessView,
  CourtRecordResponse,
  OutcomeView,
  PartyLookupResponse,
  RulingDetailView,
  RulingListResponse,
  RulingPartyInput,
  RulingPartyType,
  UserProfileView,
} from '@aero/shared';

import { apiFetch } from './client';

/** Typed client for the judicial APIs (shared wire types from @aero/shared). */

export interface RulingListFilters {
  partyType?: RulingPartyType;
  outcomeId?: number;
  from?: string;
  to?: string;
  party?: string;
  page?: number;
  pageSize?: number;
}

export function fetchRulings(filters: RulingListFilters) {
  const params = new URLSearchParams();
  if (filters.partyType) params.set('partyType', filters.partyType);
  if (filters.outcomeId !== undefined) params.set('outcomeId', String(filters.outcomeId));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.party) params.set('party', filters.party);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  const query = params.toString();
  return apiFetch<RulingListResponse>(`/api/rulings${query ? `?${query}` : ''}`);
}

export function fetchRuling(id: number | string) {
  return apiFetch<RulingDetailView>(`/api/rulings/${id}`);
}

export interface RulingSubmitPayload {
  rulingDate: string;
  documentId: string;
  outcomeIds: number[];
  parties: RulingPartyInput[];
}

export function submitRuling(payload: RulingSubmitPayload) {
  return apiFetch<RulingDetailView>('/api/rulings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function submitAppeal(
  rulingId: number,
  payload: { documentId: string; outcomeIds: number[] },
) {
  return apiFetch<RulingDetailView>(`/api/rulings/${rulingId}/appeal`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function expungeRuling(rulingId: number, reason: string) {
  return apiFetch<RulingDetailView>(`/api/rulings/${rulingId}/expunge`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function pardonRuling(rulingId: number, reason: string) {
  return apiFetch<RulingDetailView>(`/api/rulings/${rulingId}/pardon`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function lookupParties(q: string) {
  return apiFetch<PartyLookupResponse>(`/api/rulings/party-lookup?q=${encodeURIComponent(q)}`);
}

// --- Outcome vocabulary -----------------------------------------------------

export function fetchOutcomes() {
  return apiFetch<OutcomeView[]>('/api/ruling-outcomes');
}

export interface OutcomePayload {
  name: string;
  description?: string;
}

export function createOutcome(payload: OutcomePayload) {
  return apiFetch<OutcomeView>('/api/ruling-outcomes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateOutcome(id: number, payload: OutcomePayload) {
  return apiFetch<OutcomeView>(`/api/ruling-outcomes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteOutcome(id: number) {
  return apiFetch<void>(`/api/ruling-outcomes/${id}`, { method: 'DELETE' });
}

// --- Profiles & businesses (minimal, phase 05) ------------------------------

export function fetchUserProfile(robloxUserId: number | string) {
  return apiFetch<UserProfileView>(`/api/users/${robloxUserId}`);
}

export function fetchUserCourtRecord(robloxUserId: number | string) {
  return apiFetch<CourtRecordResponse>(`/api/users/${robloxUserId}/court-record`);
}

export function fetchBusiness(id: number | string) {
  return apiFetch<BusinessView>(`/api/businesses/${id}`);
}

export function fetchBusinessCourtRecord(id: number | string) {
  return apiFetch<CourtRecordResponse>(`/api/businesses/${id}/court-record`);
}
