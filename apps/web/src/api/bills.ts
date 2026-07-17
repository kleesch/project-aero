import type {
  BillDetailView,
  BillListResponse,
  BillStageEventView,
  BillStatus,
  Chamber,
  TagView,
  VotePosition,
} from '@aero/shared';

import { apiFetch } from './client';

/** Typed client for the bill APIs (shared wire types from @aero/shared). */

export interface BillListFilters {
  session?: number;
  chamber?: Chamber;
  status?: BillStatus;
  tags?: number[];
  q?: string;
  page?: number;
  pageSize?: number;
}

export function fetchBills(filters: BillListFilters) {
  const params = new URLSearchParams();
  if (filters.session !== undefined) params.set('session', String(filters.session));
  if (filters.chamber) params.set('chamber', filters.chamber);
  if (filters.status) params.set('status', filters.status);
  if (filters.tags && filters.tags.length > 0) params.set('tags', filters.tags.join(','));
  if (filters.q) params.set('q', filters.q);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  const query = params.toString();
  return apiFetch<BillListResponse>(`/api/bills${query ? `?${query}` : ''}`);
}

export function fetchBill(ref: string) {
  return apiFetch<BillDetailView>(`/api/bills/${encodeURIComponent(ref)}`);
}

export interface BillSubmitPayload {
  title: string;
  documentId: string;
  chamber?: Chamber;
  tagIds: number[];
}

export function submitBill(payload: BillSubmitPayload) {
  return apiFetch<BillDetailView>('/api/bills', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function transitionBill(ref: string | number, toStatus: BillStatus, notes?: string) {
  return apiFetch<BillDetailView>(`/api/bills/${ref}/transition`, {
    method: 'POST',
    body: JSON.stringify({ toStatus, ...(notes ? { notes } : {}) }),
  });
}

export function uploadBillVersion(ref: string | number, documentId: string) {
  return apiFetch<BillDetailView>(`/api/bills/${ref}/versions`, {
    method: 'POST',
    body: JSON.stringify({ documentId }),
  });
}

export function updateBillTags(ref: string | number, tagIds: number[]) {
  return apiFetch<TagView[]>(`/api/bills/${ref}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tagIds }),
  });
}

export interface VoteEntryPayload {
  votes: { robloxUserId: number; position: VotePosition }[];
  confirmOffRoster?: boolean;
}

export interface VoteRecordResponse {
  recorded: number;
  superseded: number;
  stageEvent: BillStageEventView | null;
}

export function recordVotes(billId: number, stageEventId: number, payload: VoteEntryPayload) {
  return apiFetch<VoteRecordResponse>(`/api/bills/${billId}/stage-events/${stageEventId}/votes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
