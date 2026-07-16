import type { DocumentView } from '@aero/shared';

import { apiFetch } from './client';

/**
 * Typed client for the document APIs: upload for any authenticated user,
 * listing and quarantine for admins. Response shapes are the shared wire
 * types (@aero/shared api/documents.ts).
 */

export function uploadDocument(file: File) {
  const body = new FormData();
  body.append('file', file);
  return apiFetch<DocumentView>('/api/documents', { method: 'POST', body });
}

export function fetchAdminDocuments() {
  return apiFetch<DocumentView[]>('/api/admin/documents');
}

export function quarantineDocument(id: string, reason: string) {
  return apiFetch<DocumentView>(`/api/admin/documents/${id}/quarantine`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function unquarantineDocument(id: string, reason: string) {
  return apiFetch<DocumentView>(`/api/admin/documents/${id}/unquarantine`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
