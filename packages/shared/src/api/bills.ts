import type { BillStage, BillStatus, VotePosition, VoteTally } from '../bills.js';
import type { Chamber } from '../congress.js';
import type { UserRef } from '../users.js';
import type { DocumentView } from './documents.js';

/**
 * Response shapes for the bill APIs (phase 04). Same contract rules as the
 * other APIs: ISO timestamps, people as `UserRef`s. Congress members are also
 * `UserRef`s — hydrated from roster snapshots when they have never logged in.
 */

export interface TagView {
  id: number;
  name: string;
  description: string | null;
}

export interface BillListItemView {
  id: number;
  /** Derived from (chamber, session, sequence), e.g. HB8401 — never the identity. */
  displayId: string;
  chamber: Chamber;
  session: number;
  sequence: number;
  title: string;
  status: BillStatus;
  submittedBy: UserRef;
  tags: TagView[];
  createdAt: string;
  updatedAt: string;
}

export interface BillListResponse {
  items: BillListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BillVoteView {
  member: UserRef;
  position: VotePosition;
  recordedBy: UserRef;
  recordedAt: string;
}

export interface BillStageEventView {
  id: number;
  stage: BillStage;
  /** The status the transition produced (e.g. ORIGIN_FLOOR for a passed committee stage). */
  outcome: BillStatus;
  /** Null when the system decided (session rollover). */
  decidedBy: UserRef | null;
  decidedAt: string;
  notes: string | null;
  /** Whether per-member votes can be recorded here (all stages but PRESIDENTIAL). */
  acceptsVotes: boolean;
  /** Live (non-superseded) votes only; corrections replace their targets. */
  votes: BillVoteView[];
  tally: VoteTally;
}

export interface BillVersionView {
  versionNo: number;
  document: DocumentView;
  uploadedBy: UserRef;
  createdAt: string;
}

export interface BillDetailView extends BillListItemView {
  versions: BillVersionView[];
  stageEvents: BillStageEventView[];
  /** Statuses the bill may legally move to next (empty when terminal). */
  legalNextStatuses: BillStatus[];
}
