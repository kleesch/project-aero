import type { AuditActionKey, AuditEntityType } from '@aero/shared';
import type { Request } from 'express';

import { db } from '../db/client.js';
import { auditEvents } from '../db/schema.js';

/**
 * Audit writer (see DESIGN.md — Auditing). Route handlers call `audit` with
 * the transaction their mutation runs in, so the event and the change commit
 * or roll back together; jobs and migrations use `auditSystem`. The table
 * itself is append-only (DB trigger), so a written event can never be
 * altered — which is also why snapshots store ids only, never names.
 */

/** Anything `.insert()` can be called on: the root db or a transaction. */
export type AuditExecutor = Pick<typeof db, 'insert'>;

export interface AuditEntry {
  /** ROBLOX user id of the actor; null means the system acted. */
  actorUserId: number | null;
  actionKey: AuditActionKey;
  entityType: AuditEntityType;
  /** Stringified on write — entity keys vary (integer ids, UUIDs). */
  entityId: string | number;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Actor-supplied justification where the action demands one (quarantine, restore). */
  reason?: string | null;
  requestIp?: string | null;
}

/**
 * Serializes a row for a `before`/`after` snapshot: plain JSON with Dates as
 * ISO strings, exactly what the jsonb column round-trips.
 */
export function toSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
}

export async function audit(executor: AuditExecutor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditEvents).values({
    actorUserId: entry.actorUserId,
    actionKey: entry.actionKey,
    entityType: entry.entityType,
    entityId: String(entry.entityId),
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    requestIp: entry.requestIp ?? null,
  });
}

/** System-actor variant for jobs and other non-request contexts. */
export async function auditSystem(
  executor: AuditExecutor,
  entry: Omit<AuditEntry, 'actorUserId' | 'requestIp'>,
): Promise<void> {
  await audit(executor, { ...entry, actorUserId: null, requestIp: null });
}

/** The actor/ip pair every route-handler audit call needs, from the request. */
export function auditContext(req: Request): Pick<AuditEntry, 'actorUserId' | 'requestIp'> {
  return {
    actorUserId: req.user?.robloxUserId ?? null,
    requestIp: req.ip ?? null,
  };
}
