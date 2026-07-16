import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '@aero/shared';
import { describe, expect, it, vi } from 'vitest';

import { audit, auditSystem, toSnapshot, type AuditExecutor } from './audit.js';

vi.mock('../db/client.js', () => ({ db: {} }));

/** Captures the values() payload instead of talking to a database. */
function makeExecutor() {
  const written: Record<string, unknown>[] = [];
  const executor = {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        written.push(row);
        return Promise.resolve();
      },
    }),
  } as unknown as AuditExecutor;
  return { executor, written };
}

describe('audit', () => {
  it('writes the entry with a stringified entity id and null defaults', async () => {
    const { executor, written } = makeExecutor();
    await audit(executor, {
      actorUserId: 42,
      actionKey: AUDIT_ACTIONS.CLAIM_MAPPING_DELETE,
      entityType: AUDIT_ENTITIES.GROUP_CLAIM_MAPPING,
      entityId: 7,
      before: { id: 7, groupId: 123 },
      requestIp: '203.0.113.9',
    });

    expect(written).toEqual([
      {
        actorUserId: 42,
        actionKey: 'claims.mapping.delete',
        entityType: 'group_claim_mapping',
        entityId: '7',
        before: { id: 7, groupId: 123 },
        after: null,
        reason: null,
        requestIp: '203.0.113.9',
      },
    ]);
  });

  it('auditSystem writes a null actor and no request ip', async () => {
    const { executor, written } = makeExecutor();
    await auditSystem(executor, {
      actionKey: AUDIT_ACTIONS.DOCUMENT_QUARANTINE,
      entityType: AUDIT_ENTITIES.DOCUMENT,
      entityId: 'abc-123',
      after: { quarantined: true },
    });

    expect(written[0]).toMatchObject({
      actorUserId: null,
      entityId: 'abc-123',
      requestIp: null,
    });
  });
});

describe('toSnapshot', () => {
  it('serializes Dates to ISO strings, matching the jsonb round-trip', () => {
    const row = { id: 1, grantedAt: new Date('2026-07-15T12:00:00Z'), reason: 'x' };
    expect(toSnapshot(row)).toEqual({
      id: 1,
      grantedAt: '2026-07-15T12:00:00.000Z',
      reason: 'x',
    });
  });
});
