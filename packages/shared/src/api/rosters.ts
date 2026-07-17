import type { Chamber } from '../congress.js';
import type { RankComparison } from '../schemas/claims.js';

/** Response shapes for the roster APIs (phase 04). */

export interface RosterMemberView {
  chamber: Chamber;
  robloxUserId: number;
  /** Group-sync snapshot; congress members need not be platform users. */
  username: string | null;
  rank: number;
  active: boolean;
  firstSeenAt: string;
  lastConfirmedAt: string;
}

export interface RosterRankRuleView {
  id: number;
  chamber: Chamber;
  comparison: RankComparison;
  rankValue: number;
}

/** Per-chamber outcome of one roster sync run. */
export interface RosterChamberSyncSummary {
  added: number;
  updated: number;
  deactivated: number;
  active: number;
}

export interface RosterSyncSummary {
  groupId: number;
  fetchedMembers: number;
  house: RosterChamberSyncSummary;
  senate: RosterChamberSyncSummary;
  syncedAt: string;
}
