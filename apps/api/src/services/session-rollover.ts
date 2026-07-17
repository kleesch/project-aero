import {
  ALL_BILL_STATUSES,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  BILL_STATUSES,
  isTerminalBillStatus,
  sessionForDate,
  STAGE_FOR_STATUS,
  type BillStatus,
} from '@aero/shared';
import { and, eq, inArray, lt } from 'drizzle-orm';

import { db } from '../db/client.js';
import { bills, billStageEvents } from '../db/schema.js';
import { auditSystem } from './audit.js';

/**
 * Session rollover (see DESIGN.md — Bills): the Congress session is computed,
 * never advanced, so bills die by sweep — a daily 00:05 ET job plus a lazy
 * guard on every bill mutation, belt and suspenders. Death is a full pipeline
 * event: status update, system-actor stage event, audit entry.
 */

const ACTIVE_STATUSES: BillStatus[] = ALL_BILL_STATUSES.filter(
  (status) => !isTerminalBillStatus(status),
);

/**
 * Marks one bill dead. The status equality check makes racing sweeps (or a
 * sweep racing the lazy guard) write the death exactly once.
 */
async function markBillDied(
  bill: typeof bills.$inferSelect,
  currentSession: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(bills)
      .set({ status: BILL_STATUSES.DIED_IN_SESSION, updatedAt: new Date() })
      .where(and(eq(bills.id, bill.id), eq(bills.status, bill.status)))
      .returning();
    if (!updated) return false;

    await tx.insert(billStageEvents).values({
      billId: bill.id,
      // Non-terminal statuses always sit at a stage.
      stage: STAGE_FOR_STATUS[bill.status]!,
      outcome: BILL_STATUSES.DIED_IN_SESSION,
      decidedBy: null,
      notes: `Died at session rollover (bill session ${bill.session}, current session ${currentSession}).`,
    });
    await auditSystem(tx, {
      actionKey: AUDIT_ACTIONS.BILL_DIED_IN_SESSION,
      entityType: AUDIT_ENTITIES.BILL,
      entityId: bill.id,
      before: { status: bill.status },
      after: { status: BILL_STATUSES.DIED_IN_SESSION },
    });
    return true;
  });
}

/** The daily sweep: kills every still-active bill from a prior session. */
export async function rolloverExpiredBills(now: Date = new Date()): Promise<number> {
  const currentSession = sessionForDate(now);
  const expired = await db
    .select()
    .from(bills)
    .where(and(lt(bills.session, currentSession), inArray(bills.status, ACTIVE_STATUSES)));

  let died = 0;
  for (const bill of expired) {
    if (await markBillDied(bill, currentSession)) died += 1;
  }
  return died;
}

/**
 * Lazy guard for bill mutation endpoints: if the bill's session has passed,
 * kill it now and report true so the caller rejects the mutation — a bill
 * must never advance after its session ended just because the daily sweep
 * has not run yet.
 */
export async function guardBillSession(bill: typeof bills.$inferSelect): Promise<boolean> {
  if (isTerminalBillStatus(bill.status)) return false;
  const currentSession = sessionForDate(new Date());
  if (bill.session >= currentSession) return false;
  await markBillDied(bill, currentSession);
  return true;
}
