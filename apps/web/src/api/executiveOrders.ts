import type {
  ExecutiveOrderDetailView,
  ExecutiveOrderListItemView,
  ExecutiveOrderListResponse,
  NextEoNumberResponse,
} from '@aero/shared';

import { apiFetch } from './client';

/** Typed client for the Executive Order APIs (shared wire types from @aero/shared). */

export interface ExecutiveOrderListFilters {
  status?: string;
  issuedBy?: number;
  from?: string;
  to?: string;
  q?: string;
  missingSummary?: boolean;
  page?: number;
  pageSize?: number;
}

export function fetchExecutiveOrders(filters: ExecutiveOrderListFilters) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.issuedBy !== undefined) params.set('issuedBy', String(filters.issuedBy));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.q) params.set('q', filters.q);
  if (filters.missingSummary !== undefined) {
    params.set('missingSummary', String(filters.missingSummary));
  }
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  const query = params.toString();
  return apiFetch<ExecutiveOrderListResponse>(`/api/executive-orders${query ? `?${query}` : ''}`);
}

export function fetchExecutiveOrder(eoNumber: number | string) {
  return apiFetch<ExecutiveOrderDetailView>(`/api/executive-orders/${eoNumber}`);
}

export function fetchNextEoNumber() {
  return apiFetch<NextEoNumberResponse>('/api/executive-orders/next-number');
}

export interface IssueOrderPayload {
  eoNumber: number;
  title: string;
  issuedByRobloxUserId: number;
  effectiveDate: string;
  expiresAt?: string;
  documentId: string;
  summary?: string;
  repealsEoId?: number;
  supersedesEoId?: number;
}

export function issueExecutiveOrder(payload: IssueOrderPayload) {
  return apiFetch<ExecutiveOrderDetailView>('/api/executive-orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface UpdateOrderPayload {
  title: string;
  summary: string | null;
  effectiveDate: string;
  expiresAt: string | null;
}

export function updateExecutiveOrder(eoNumber: number, payload: UpdateOrderPayload) {
  return apiFetch<ExecutiveOrderDetailView>(`/api/executive-orders/${eoNumber}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function changeExecutiveOrderStatus(
  eoNumber: number,
  payload: { status: string; reason: string },
) {
  return apiFetch<ExecutiveOrderDetailView>(`/api/executive-orders/${eoNumber}/status`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchIssuedExecutiveOrders(robloxUserId: number | string) {
  return apiFetch<{ items: ExecutiveOrderListItemView[] }>(
    `/api/users/${robloxUserId}/executive-orders`,
  );
}
