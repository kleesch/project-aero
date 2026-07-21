import type { DocumentView } from './documents.js';
import type { EffectiveEoStatus } from '../executive-orders.js';
import type { UserRef } from '../users.js';

/**
 * Response shapes for the Executive Order APIs (phase 10). Same contract
 * rules as the other APIs: ISO timestamps, people as `UserRef`s. Effective
 * dates are calendar dates (`YYYY-MM-DD`); expiry is an instant.
 */

/** Minimal EO identity for cross-links between orders. */
export interface ExecutiveOrderRef {
  id: number;
  eoNumber: number;
  title: string;
  /** Effective status at serialization time. */
  status: EffectiveEoStatus;
}

export interface ExecutiveOrderListItemView {
  id: number;
  eoNumber: number;
  title: string;
  /** Derived: stored status plus expiry (`expired` is never stored). */
  status: EffectiveEoStatus;
  issuedBy: UserRef;
  effectiveDate: string;
  expiresAt: string | null;
  /** So editors can filter for orders still lacking a written summary. */
  hasSummary: boolean;
  createdAt: string;
}

export interface ExecutiveOrderListResponse {
  items: ExecutiveOrderListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ExecutiveOrderDetailView extends ExecutiveOrderListItemView {
  summary: string | null;
  document: DocumentView;
  createdBy: UserRef;
  /** The earlier order this one repeals / supersedes (null when neither). */
  repeals: ExecutiveOrderRef | null;
  supersedes: ExecutiveOrderRef | null;
  /** The later order that repealed / superseded this one (null when neither). */
  repealedBy: ExecutiveOrderRef | null;
  supersededBy: ExecutiveOrderRef | null;
  updatedAt: string;
}

/** Response of the next-number suggestion endpoint. */
export interface NextEoNumberResponse {
  nextNumber: number;
}
