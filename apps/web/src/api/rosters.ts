import type {
  Chamber,
  RosterMemberView,
  RosterRankRuleCreate,
  RosterRankRuleView,
  RosterSyncSummary,
} from '@aero/shared';

import { apiFetch } from './client';

/** Typed client for the roster APIs (reading is public; the rest is claim-gated). */

export function fetchRosters(chamber?: Chamber) {
  return apiFetch<RosterMemberView[]>(`/api/rosters${chamber ? `?chamber=${chamber}` : ''}`);
}

export function resyncRosters() {
  return apiFetch<RosterSyncSummary>('/api/rosters/resync', { method: 'POST' });
}

export function fetchRankRules() {
  return apiFetch<RosterRankRuleView[]>('/api/admin/roster-rank-rules');
}

export function createRankRule(payload: RosterRankRuleCreate) {
  return apiFetch<RosterRankRuleView>('/api/admin/roster-rank-rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateRankRule(id: number, payload: RosterRankRuleCreate) {
  return apiFetch<RosterRankRuleView>(`/api/admin/roster-rank-rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteRankRule(id: number) {
  return apiFetch<void>(`/api/admin/roster-rank-rules/${id}`, { method: 'DELETE' });
}
