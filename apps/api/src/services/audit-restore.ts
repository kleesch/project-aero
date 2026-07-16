import { AUDIT_ENTITIES, type AuditEntityType } from '@aero/shared';
import { eq, getTableColumns, sql } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';

import type { DbTransaction } from '../db/client.js';
import { directClaimGrants, groupClaimMappings } from '../db/schema.js';

/**
 * Restore-from-audit (see DESIGN.md — Auditing → rollback-capable): an admin
 * re-applies a `before` snapshot to recover a deleted or tampered record.
 * Entities opt in here; anything not registered cannot be restored. The
 * restore is an upsert keyed on the primary key — a deleted row comes back
 * with its original id, a tampered row is overwritten in place.
 */

interface RestorableEntity {
  table: PgTable;
  /** Property name (drizzle key) of the primary-key column. */
  pkProp: string;
  /**
   * True for integer identity keys: after inserting an explicit id the
   * sequence must be resynced or the next natural insert would collide.
   */
  resyncSequence: boolean;
}

const RESTORABLE_ENTITIES: Partial<Record<AuditEntityType, RestorableEntity>> = {
  [AUDIT_ENTITIES.GROUP_CLAIM_MAPPING]: {
    table: groupClaimMappings,
    pkProp: 'id',
    resyncSequence: true,
  },
  [AUDIT_ENTITIES.DIRECT_CLAIM_GRANT]: {
    table: directClaimGrants,
    pkProp: 'id',
    resyncSequence: true,
  },
};

export function isRestorableEntityType(entityType: string): entityType is AuditEntityType {
  return entityType in RESTORABLE_ENTITIES;
}

/**
 * Rebuilds a drizzle insert row from a jsonb snapshot: only known columns are
 * accepted (a hand-crafted snapshot cannot smuggle extra properties), and ISO
 * strings are turned back into Dates for timestamp columns.
 */
function rowFromSnapshot(table: PgTable, snapshot: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const [prop, column] of Object.entries(getTableColumns(table))) {
    if (!(prop in snapshot)) continue;
    const value = snapshot[prop];
    row[prop] = value != null && column.dataType === 'date' ? new Date(value as string) : value;
  }
  return row;
}

/**
 * Re-applies a `before` snapshot inside the caller's transaction and returns
 * the row state it overwrote (null when the row had been deleted). The caller
 * is responsible for writing the accompanying `audit.restore` event.
 */
export async function restoreSnapshot(
  tx: DbTransaction,
  entityType: AuditEntityType,
  snapshot: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const entity = RESTORABLE_ENTITIES[entityType];
  if (!entity) throw new Error(`Entity type "${entityType}" is not restorable.`);

  const row = rowFromSnapshot(entity.table, snapshot);
  const pkColumn = getTableColumns(entity.table)[entity.pkProp];
  if (!pkColumn || row[entity.pkProp] == null) {
    throw new Error(`Snapshot for "${entityType}" is missing its primary key.`);
  }

  const [previous] = await tx
    .select()
    .from(entity.table)
    .where(eq(pkColumn, row[entity.pkProp]))
    .for('update');

  // The conflict-update set must exclude the key: identity columns declared
  // GENERATED ALWAYS reject explicit UPDATE values (the insert path needs —
  // and has — OVERRIDING SYSTEM VALUE instead).
  const changes = Object.fromEntries(
    Object.entries(row).filter(([prop]) => prop !== entity.pkProp),
  );
  await tx
    .insert(entity.table)
    .overridingSystemValue()
    .values(row)
    .onConflictDoUpdate({ target: pkColumn, set: changes });

  if (entity.resyncSequence) {
    // Explicit-id inserts do not advance the identity sequence; resync it so
    // the next natural insert cannot collide with the restored id.
    const { name: tableName } = getTableConfig(entity.table);
    await tx.execute(sql`
      SELECT setval(
        pg_get_serial_sequence(${tableName}, ${pkColumn.name}),
        (SELECT MAX(${sql.identifier(pkColumn.name)}) FROM ${sql.identifier(tableName)}),
        true
      )
    `);
  }

  return previous ?? null;
}
