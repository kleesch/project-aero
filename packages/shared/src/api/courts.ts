import type { RulingPartySide, RulingPartyType, RulingStatus } from '../courts.js';
import type { UserRef } from '../users.js';
import type { DocumentView } from './documents.js';

/**
 * Response shapes for the judicial APIs (phase 05). Same contract rules as
 * the other APIs: ISO timestamps, people as `UserRef`s. Ruling dates are
 * calendar dates (`YYYY-MM-DD`), not instants.
 */

export interface OutcomeView {
  id: number;
  name: string;
  description: string | null;
}

/** Minimal business identity on the wire; phase 06 grows the full view. */
export interface BusinessRef {
  id: number;
  name: string;
}

/**
 * Exactly one of `user`/`business` is set for those party types; a
 * government party carries neither and renders as the fixed label.
 */
export interface RulingPartyView {
  id: number;
  side: RulingPartySide;
  partyType: RulingPartyType;
  user: UserRef | null;
  business: BusinessRef | null;
}

export interface RulingListItemView {
  id: number;
  /** Calendar date the ruling was entered for (YYYY-MM-DD). */
  rulingDate: string;
  /** Non-active statuses are only ever serialized to privileged viewers. */
  status: RulingStatus;
  enteredBy: UserRef;
  outcomes: OutcomeView[];
  parties: RulingPartyView[];
  hasAppeal: boolean;
  createdAt: string;
}

export interface RulingListResponse {
  items: RulingListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AppealView {
  id: number;
  document: DocumentView;
  enteredBy: UserRef;
  enteredAt: string;
  outcomes: OutcomeView[];
}

export interface RulingDetailView extends RulingListItemView {
  document: DocumentView;
  /** At most one appeal per ruling (Supreme Court verdict). */
  appeal: AppealView | null;
}

/** One typeahead hit from the party lookup endpoint. */
export interface PartyLookupUser {
  robloxUserId: number;
  username: string;
  displayName: string | null;
  /** False for stub rows fetched from ROBLOX for users who never logged in. */
  isPlatformUser: boolean;
}

export interface PartyLookupResponse {
  users: PartyLookupUser[];
  businesses: BusinessRef[];
  /** True when the query also matches the fixed government entity. */
  government: boolean;
}

/** Minimal public profile (phase 05); later phases add bills, medals, …. */
export interface UserProfileView {
  robloxUserId: number;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Null for stub rows created via party lookup — they never logged in. */
  lastLoginAt: string | null;
  createdAt: string;
}

/** Minimal business page view (phase 05); phase 06 grows registration detail. */
export interface BusinessView {
  id: number;
  name: string;
  status: string;
  owner: UserRef;
  createdAt: string;
}

/** Court-record section payload for profile and business pages. */
export interface CourtRecordResponse {
  items: RulingListItemView[];
}
