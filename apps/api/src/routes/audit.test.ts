import { AUDIT_ACTIONS, AUDIT_ENTITIES, type UserRef } from '@aero/shared';
import { describe, expect, it, vi } from 'vitest';

import type { auditEvents } from '../db/schema.js';
import type { UserRefLookup } from '../services/user-refs.js';
import { toEventView } from './audit.js';

vi.mock('../db/client.js', () => ({ db: {} }));

const refs = ((id: number | null | undefined) =>
  id == null
    ? null
    : ({
        robloxUserId: id,
        username: `user${id}`,
        displayName: null,
      } satisfies UserRef)) as UserRefLookup;

function makeRow(
  overrides: Partial<typeof auditEvents.$inferSelect>,
): typeof auditEvents.$inferSelect {
  return {
    id: 1,
    actorUserId: 42,
    actionKey: AUDIT_ACTIONS.CLAIM_MAPPING_DELETE,
    entityType: AUDIT_ENTITIES.GROUP_CLAIM_MAPPING,
    entityId: '7',
    before: { id: 7 },
    after: null,
    reason: null,
    occurredAt: new Date('2026-07-15T12:00:00Z'),
    requestIp: '203.0.113.9',
    ...overrides,
  };
}

describe('toEventView', () => {
  it('hydrates the actor into a UserRef and ISO-formats the timestamp', () => {
    const view = toEventView(makeRow({}), refs);
    expect(view.actor).toEqual({ robloxUserId: 42, username: 'user42', displayName: null });
    expect(view.occurredAt).toBe('2026-07-15T12:00:00.000Z');
  });

  it('maps a null actor to null (rendered as System)', () => {
    expect(toEventView(makeRow({ actorUserId: null }), refs).actor).toBeNull();
  });

  it('marks events restorable only with a before snapshot on an opted-in entity', () => {
    expect(toEventView(makeRow({}), refs).restorable).toBe(true);
    expect(toEventView(makeRow({ before: null }), refs).restorable).toBe(false);
    expect(toEventView(makeRow({ entityType: 'not_registered' }), refs).restorable).toBe(false);
  });
});
