import { CLAIM_KEYS } from '@aero/shared';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '../auth/sessions.js';
import { resolveUserClaims } from '../claims/resolution.js';
import { requireAuth, requireClaim } from './claims.js';

vi.mock('../claims/resolution.js', () => ({
  resolveUserClaims: vi.fn(),
}));

const resolveMock = vi.mocked(resolveUserClaims);

const testUser: SessionUser = {
  robloxUserId: 42,
  username: 'tester',
  displayName: null,
  avatarUrl: null,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Gated test app: `x-test-user` simulates an authenticated session. */
function makeApp() {
  const app = express();
  app.use((req, _res, next) => {
    if (req.headers['x-test-user']) req.user = testUser;
    next();
  });
  app.get('/gated', requireClaim(CLAIM_KEYS.CLAIMS_MANAGE), (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/authed', requireAuth, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

beforeEach(() => {
  resolveMock.mockReset();
});

describe('requireAuth', () => {
  it('401s anonymous requests', async () => {
    await request(makeApp()).get('/authed').expect(401);
  });

  it('passes authenticated requests through', async () => {
    await request(makeApp()).get('/authed').set('x-test-user', '1').expect(200);
  });
});

describe('requireClaim', () => {
  it('401s anonymous requests without resolving claims', async () => {
    await request(makeApp()).get('/gated').expect(401);
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('403s an authenticated user without the claim', async () => {
    resolveMock.mockResolvedValue({ claims: [], resolved: [], blocked: [] });
    await request(makeApp()).get('/gated').set('x-test-user', '1').expect(403);
  });

  it('200s an authenticated user holding the claim', async () => {
    resolveMock.mockResolvedValue({
      claims: [CLAIM_KEYS.CLAIMS_MANAGE],
      resolved: [{ key: CLAIM_KEYS.CLAIMS_MANAGE, sources: [{ type: 'admin-implied' }] }],
      blocked: [],
    });
    await request(makeApp()).get('/gated').set('x-test-user', '1').expect(200);
  });

  it('resolves fresh on every request, so a new negative grant blocks instantly', async () => {
    const app = makeApp();
    resolveMock.mockResolvedValueOnce({
      claims: [CLAIM_KEYS.CLAIMS_MANAGE],
      resolved: [],
      blocked: [],
    });
    await request(app).get('/gated').set('x-test-user', '1').expect(200);

    // The negative grant lands; the very next request must be denied.
    resolveMock.mockResolvedValueOnce({ claims: [], resolved: [], blocked: [] });
    await request(app).get('/gated').set('x-test-user', '1').expect(403);
  });
});
