import type { AuditEventView, AuditLogPage } from '@aero/shared';

import { apiFetch } from './client';

/**
 * Typed client for the audit API (gated by audit:view; restore by admin).
 * Response shapes are the shared wire types (@aero/shared api/audit.ts).
 */

export interface AuditLogFilters {
  /** ROBLOX user id, or 'system' for system-actor events. */
  actor?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  /** ISO timestamps. */
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function fetchAuditLog(filters: AuditLogFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return apiFetch<AuditLogPage>(`/api/audit${query ? `?${query}` : ''}`);
}

export function restoreAuditEvent(id: number, reason: string) {
  return apiFetch<{ restored: AuditEventView }>(`/api/admin/audit/${id}/restore`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
