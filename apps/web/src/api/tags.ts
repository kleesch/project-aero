import type { TagCreate, TagView } from '@aero/shared';

import { apiFetch } from './client';

/** Typed client for the tag vocabulary (reading is public, managing is tags:manage). */

export function fetchTags() {
  return apiFetch<TagView[]>('/api/tags');
}

export function createTag(payload: TagCreate) {
  return apiFetch<TagView>('/api/tags', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateTag(id: number, payload: TagCreate) {
  return apiFetch<TagView>(`/api/tags/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteTag(id: number) {
  return apiFetch<void>(`/api/tags/${id}`, { method: 'DELETE' });
}
