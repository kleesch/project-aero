import type { AuditActionKey } from '../audit.js';
import type { UserRef } from '../users.js';

/**
 * Response shapes for the audit API. Same contract rules as the claims API:
 * timestamps are ISO strings, people are `UserRef`s — `actor: null` always
 * means the system acted (jobs, migrations), rendered as "System".
 */

export interface AuditEventView {
  id: number;
  actor: UserRef | null;
  actionKey: AuditActionKey;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** Actor-supplied justification where the action demands one (quarantine, restore). */
  reason: string | null;
  occurredAt: string;
  requestIp: string | null;
  /** True when the entity type is opted into restore-from-audit and this event carries a `before` snapshot. */
  restorable: boolean;
}

export interface AuditLogPage {
  events: AuditEventView[];
  /** Total rows matching the filters, for pagination. */
  total: number;
}
