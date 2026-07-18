import { createHmac } from 'node:crypto';

import { CLAIM_KEYS, type RulingDetailView } from '@aero/shared';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * End-to-end tests for the judicial records domain against a real Postgres,
 * mirroring bills.integration.test.ts. Gated on TEST_DATABASE_URL and skipped
 * without it. Runs against its own database (suffix `_rulings`) so the two
 * integration files can truncate freely in parallel workers.
 *
 * The ROBLOX Users API is stubbed at the fetch level: the party-lookup
 * stub-user flow must work for people who have never logged in, without
 * network access.
 */

const BASE_TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';

function rulingsDatabaseUrl(base: string): string {
  const url = new URL(base);
  url.pathname = `${url.pathname}_rulings`;
  return url.toString();
}

// Deterministic test identities (roblox user ids; disjoint from bills tests).
const JUDGE = 2001; // court:submit
const SUPREME = 2002; // court:appeal-verdict
const EXPUNGER = 2003; // court:expunge
const PRESIDENT = 2004; // court:pardon
const VOCAB_ADMIN = 2005; // tags:manage
const RANDO = 2006; // no claims
const BUSINESS_OWNER = 2007;
const STUB_USER = 555001; // exists on "ROBLOX" but has never logged in here

async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const dbName = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${dbName}"`);
  } catch (error) {
    // 42P04: already exists.
    if ((error as { code?: string }).code !== '42P04') throw error;
  } finally {
    await client.end();
  }
}

describe.runIf(Boolean(BASE_TEST_DATABASE_URL))('judicial records (integration)', () => {
  let db: (typeof import('../db/client.js'))['db'];
  let pool: (typeof import('../db/client.js'))['pool'];
  let schema: typeof import('../db/schema.js');
  let app: import('express').Express;

  const sessions = new Map<number, string>();
  let businessId: number;
  let guiltyId: number;
  let notGuiltyId: number;
  let overturnedId: number;

  const realFetch = globalThis.fetch;

  function cookieFor(userId: number): string {
    const token = sessions.get(userId);
    if (!token) throw new Error(`no session for user ${userId}`);
    const signature = createHmac('sha256', process.env.SESSION_SECRET ?? '')
      .update(token)
      .digest('base64')
      .replace(/=+$/, '');
    return `aero_session=${encodeURIComponent(`s:${token}.${signature}`)}`;
  }

  const as = (userId: number) => ({ Cookie: cookieFor(userId) });

  async function createDocument(uploader: number): Promise<string> {
    const [row] = await db
      .insert(schema.documents)
      .values({
        uploaderUserId: uploader,
        byteSize: 1024,
        sha256: 'b'.repeat(64),
        mime: 'application/pdf',
        displayFilename: 'judgment.pdf',
      })
      .returning({ id: schema.documents.id });
    return row!.id;
  }

  beforeAll(async () => {
    const testUrl = rulingsDatabaseUrl(BASE_TEST_DATABASE_URL);
    process.env.DATABASE_URL = testUrl;
    process.env.LOG_LEVEL = 'warn';
    await ensureDatabase(testUrl);

    // The ROBLOX Users API, stubbed: STUB_USER exists, nobody else does.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `https://users.roblox.com/v1/users/${STUB_USER}`) {
        return new Response(
          JSON.stringify({ id: STUB_USER, name: 'StubUser', displayName: 'Stubby' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.startsWith('https://users.roblox.com/v1/users/')) {
        return new Response('{}', { status: 404 });
      }
      if (url === 'https://users.roblox.com/v1/usernames/users') {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return realFetch(input, init);
    }) as typeof fetch;

    const migrate = await import('../db/migrate.js');
    await migrate.runMigrations();
    ({ db, pool } = await import('../db/client.js'));
    schema = await import('../db/schema.js');
    const { createApp } = await import('../app.js');
    app = createApp();

    // Reset the judicial domain. audit_events is append-only and users rows
    // may be referenced by old audit rows, so neither is truncated.
    await db.execute(sql`
      TRUNCATE appeal_outcome_links, appeals, ruling_outcome_links, ruling_parties,
        rulings, ruling_outcomes, businesses, documents
      RESTART IDENTITY CASCADE
    `);
    await db.execute(sql`DELETE FROM sessions`);
    await db.execute(sql`DELETE FROM user_group_cache`);
    await db.execute(sql`DELETE FROM direct_claim_grants WHERE user_id < 10000`);
    // The stub row may survive an earlier run; the lookup must re-create it.
    await db.execute(sql`DELETE FROM users WHERE roblox_user_id = ${STUB_USER}`);

    const testUsers = [JUDGE, SUPREME, EXPUNGER, PRESIDENT, VOCAB_ADMIN, RANDO, BUSINESS_OWNER];
    await db
      .insert(schema.users)
      .values(testUsers.map((id) => ({ robloxUserId: id, username: `user${id}` })))
      .onConflictDoNothing();
    // Mark them as logged-in platform users; fresh empty group caches so
    // claim resolution never calls ROBLOX.
    await db.execute(sql`
      UPDATE users SET last_login_at = now() WHERE roblox_user_id < 10000
    `);
    await db
      .insert(schema.userGroupCache)
      .values(testUsers.map((id) => ({ userId: id, groups: [] })));

    const grant = (userId: number, claimKey: string) => ({
      userId,
      claimKey,
      isNegative: false,
      reason: 'integration test seed',
      grantedBy: null,
    });
    await db
      .insert(schema.directClaimGrants)
      .values([
        grant(JUDGE, CLAIM_KEYS.COURT_SUBMIT),
        grant(SUPREME, CLAIM_KEYS.COURT_APPEAL_VERDICT),
        grant(EXPUNGER, CLAIM_KEYS.COURT_EXPUNGE),
        grant(PRESIDENT, CLAIM_KEYS.COURT_PARDON),
        grant(VOCAB_ADMIN, CLAIM_KEYS.TAGS_MANAGE),
      ]);

    const [business] = await db
      .insert(schema.businesses)
      .values({ name: 'Acme Autos', ownerUserId: BUSINESS_OWNER, createdBy: VOCAB_ADMIN })
      .returning({ id: schema.businesses.id });
    businessId = business!.id;

    const { createSession } = await import('../auth/sessions.js');
    for (const id of testUsers) {
      sessions.set(id, (await createSession(id)).token);
    }
  }, 60_000);

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await pool?.end();
  });

  describe('outcome vocabulary', () => {
    it('is managed under tags:manage and readable anonymously', async () => {
      expect(
        (await request(app).post('/api/ruling-outcomes').set(as(RANDO)).send({ name: 'nope' }))
          .status,
      ).toBe(403);

      for (const [name, setter] of [
        ['guilty', (id: number) => (guiltyId = id)],
        ['not guilty', (id: number) => (notGuiltyId = id)],
        ['overturned', (id: number) => (overturnedId = id)],
      ] as const) {
        const created = await request(app)
          .post('/api/ruling-outcomes')
          .set(as(VOCAB_ADMIN))
          .send({ name });
        expect(created.status).toBe(201);
        setter(created.body.id);
      }

      const anonymous = await request(app).get('/api/ruling-outcomes');
      expect(anonymous.status).toBe(200);
      expect(anonymous.body).toHaveLength(3);
    });
  });

  describe('party lookup', () => {
    it('is gated by court:submit', async () => {
      expect((await request(app).get('/api/rulings/party-lookup?q=stub')).status).toBe(401);
      expect(
        (await request(app).get('/api/rulings/party-lookup?q=stub').set(as(RANDO))).status,
      ).toBe(403);
    });

    it('finds a never-logged-in user by ROBLOX id and creates a stub row', async () => {
      const response = await request(app)
        .get(`/api/rulings/party-lookup?q=${STUB_USER}`)
        .set(as(JUDGE));
      expect(response.status).toBe(200);
      expect(response.body.users).toEqual([
        {
          robloxUserId: STUB_USER,
          username: 'StubUser',
          displayName: 'Stubby',
          isPlatformUser: false,
        },
      ]);

      const [row] = await db
        .execute(sql`SELECT username, last_login_at FROM users WHERE roblox_user_id = ${STUB_USER}`)
        .then((result) => result.rows);
      expect(row).toMatchObject({ username: 'StubUser', last_login_at: null });
    });

    it('finds platform users and businesses, and the fixed government entity', async () => {
      const byName = await request(app).get('/api/rulings/party-lookup?q=user2007').set(as(JUDGE));
      expect(byName.status).toBe(200);
      expect(byName.body.users[0]).toMatchObject({
        robloxUserId: BUSINESS_OWNER,
        isPlatformUser: true,
      });

      const business = await request(app).get('/api/rulings/party-lookup?q=acme').set(as(JUDGE));
      expect(business.body.businesses).toEqual([{ id: businessId, name: 'Acme Autos' }]);

      const government = await request(app)
        .get('/api/rulings/party-lookup?q=united states')
        .set(as(JUDGE));
      expect(government.body.government).toBe(true);
    });
  });

  describe('ruling entry', () => {
    let ruling: RulingDetailView;

    it('rejects entry without the claim and with bad references', async () => {
      const documentId = await createDocument(JUDGE);
      const base = {
        rulingDate: '2026-07-01',
        documentId,
        outcomeIds: [guiltyId],
        parties: [{ partyType: 'government', side: 'plaintiff' }],
      };
      expect((await request(app).post('/api/rulings').set(as(RANDO)).send(base)).status).toBe(403);
      expect(
        (
          await request(app)
            .post('/api/rulings')
            .set(as(JUDGE))
            .send({ ...base, outcomeIds: [999] })
        ).status,
      ).toBe(422);
      expect(
        (
          await request(app)
            .post('/api/rulings')
            .set(as(JUDGE))
            .send({
              ...base,
              parties: [
                ...base.parties,
                { partyType: 'business', side: 'defendant', businessId: 999 },
              ],
            })
        ).status,
      ).toBe(422);

      const foreignDocument = await createDocument(RANDO);
      expect(
        (
          await request(app)
            .post('/api/rulings')
            .set(as(JUDGE))
            .send({ ...base, documentId: foreignDocument })
        ).status,
      ).toBe(422);
    });

    it('enters a ruling with linked user, business, and government parties', async () => {
      const documentId = await createDocument(JUDGE);
      const response = await request(app)
        .post('/api/rulings')
        .set(as(JUDGE))
        .send({
          rulingDate: '2026-07-01',
          documentId,
          outcomeIds: [guiltyId],
          parties: [
            { partyType: 'government', side: 'plaintiff' },
            { partyType: 'user', side: 'defendant', robloxUserId: STUB_USER },
            { partyType: 'business', side: 'defendant', businessId },
          ],
        });
      expect(response.status).toBe(201);
      ruling = response.body as RulingDetailView;

      expect(ruling.status).toBe('active');
      expect(ruling.outcomes).toEqual([{ id: guiltyId, name: 'guilty', description: null }]);
      const government = ruling.parties.find((party) => party.partyType === 'government')!;
      expect(government).toMatchObject({ side: 'plaintiff', user: null, business: null });
      const user = ruling.parties.find((party) => party.partyType === 'user')!;
      expect(user.user).toMatchObject({ robloxUserId: STUB_USER, username: 'StubUser' });
      const business = ruling.parties.find((party) => party.partyType === 'business')!;
      expect(business.business).toEqual({ id: businessId, name: 'Acme Autos' });
      expect(ruling.document.fileUrl).toMatch(/\/files\//);
    });

    it('resolves parties to profile and business pages', async () => {
      const profile = await request(app).get(`/api/users/${STUB_USER}`);
      expect(profile.status).toBe(200);
      expect(profile.body).toMatchObject({ username: 'StubUser', lastLoginAt: null });

      const business = await request(app).get(`/api/businesses/${businessId}`);
      expect(business.status).toBe(200);
      expect(business.body).toMatchObject({ name: 'Acme Autos' });
      expect(business.body.owner).toMatchObject({ robloxUserId: BUSINESS_OWNER });
    });

    it('lists and filters publicly', async () => {
      const anonymous = await request(app).get('/api/rulings');
      expect(anonymous.status).toBe(200);
      expect(anonymous.body.total).toBe(1);
      expect(anonymous.body.items[0].id).toBe(ruling.id);

      expect((await request(app).get('/api/rulings?partyType=business')).body.total).toBe(1);
      expect((await request(app).get(`/api/rulings?outcomeId=${notGuiltyId}`)).body.total).toBe(0);
      expect((await request(app).get('/api/rulings?party=StubUser')).body.total).toBe(1);
      expect((await request(app).get('/api/rulings?party=acme')).body.total).toBe(1);
      expect((await request(app).get('/api/rulings?party=united states')).body.total).toBe(1);
      expect((await request(app).get('/api/rulings?party=nobody-here')).body.total).toBe(0);
      expect((await request(app).get('/api/rulings?from=2026-08-01')).body.total).toBe(0);
    });

    it('appears on the parties’ court records', async () => {
      const userRecord = await request(app).get(`/api/users/${STUB_USER}/court-record`);
      expect(userRecord.status).toBe(200);
      expect(userRecord.body.items).toHaveLength(1);

      const businessRecord = await request(app).get(`/api/businesses/${businessId}/court-record`);
      expect(businessRecord.body.items).toHaveLength(1);
    });

    describe('appeal', () => {
      it('enters one Supreme Court verdict, exactly once, under court:appeal-verdict', async () => {
        const verdictDocument = await createDocument(SUPREME);
        const payload = { documentId: verdictDocument, outcomeIds: [overturnedId] };

        expect(
          (await request(app).post(`/api/rulings/${ruling.id}/appeal`).set(as(JUDGE)).send(payload))
            .status,
        ).toBe(403);

        const response = await request(app)
          .post(`/api/rulings/${ruling.id}/appeal`)
          .set(as(SUPREME))
          .send(payload);
        expect(response.status).toBe(201);
        const detail = response.body as RulingDetailView;
        expect(detail.hasAppeal).toBe(true);
        expect(detail.appeal).toMatchObject({
          outcomes: [{ id: overturnedId, name: 'overturned', description: null }],
        });
        expect(detail.appeal!.enteredBy).toMatchObject({ robloxUserId: SUPREME });
        expect(detail.appeal!.document.id).toBe(verdictDocument);
        // The original judgment stays alongside the verdict.
        expect(detail.document.id).toBe(ruling.document.id);

        const secondDocument = await createDocument(SUPREME);
        const second = await request(app)
          .post(`/api/rulings/${ruling.id}/appeal`)
          .set(as(SUPREME))
          .send({ documentId: secondDocument, outcomeIds: [overturnedId] });
        expect(second.status).toBe(409);
      });

      it('filters the list by appeal outcomes too', async () => {
        const response = await request(app).get(`/api/rulings?outcomeId=${overturnedId}`);
        expect(response.body.total).toBe(1);
      });
    });

    describe('expungement', () => {
      it('requires court:expunge and a reason', async () => {
        expect(
          (
            await request(app)
              .post(`/api/rulings/${ruling.id}/expunge`)
              .set(as(JUDGE))
              .send({ reason: 'sealed by court order' })
          ).status,
        ).toBe(403);
        expect(
          (await request(app).post(`/api/rulings/${ruling.id}/expunge`).set(as(EXPUNGER)).send({}))
            .status,
        ).toBe(400);

        const response = await request(app)
          .post(`/api/rulings/${ruling.id}/expunge`)
          .set(as(EXPUNGER))
          .send({ reason: 'sealed by court order' });
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('expunged');
      });

      it('hides the ruling from the public everywhere while court:submit still sees it flagged', async () => {
        expect((await request(app).get(`/api/rulings/${ruling.id}`)).status).toBe(404);
        expect((await request(app).get('/api/rulings')).body.total).toBe(0);
        expect(
          (await request(app).get(`/api/users/${STUB_USER}/court-record`)).body.items,
        ).toHaveLength(0);
        expect(
          (await request(app).get(`/api/businesses/${businessId}/court-record`)).body.items,
        ).toHaveLength(0);

        const privileged = await request(app).get(`/api/rulings/${ruling.id}`).set(as(JUDGE));
        expect(privileged.status).toBe(200);
        expect(privileged.body.status).toBe('expunged');
        const privilegedList = await request(app).get('/api/rulings').set(as(JUDGE));
        expect(privilegedList.body.total).toBe(1);
        const privilegedRecord = await request(app)
          .get(`/api/users/${STUB_USER}/court-record`)
          .set(as(JUDGE));
        expect(privilegedRecord.body.items).toHaveLength(1);

        // Other court claims do not confer visibility.
        expect(
          (await request(app).get(`/api/rulings/${ruling.id}`).set(as(PRESIDENT))).status,
        ).toBe(404);
      });

      it('preserves the rows and audit trail intact', async () => {
        const parties = await db.execute(
          sql`SELECT count(*)::int AS n FROM ruling_parties WHERE ruling_id = ${ruling.id}`,
        );
        expect(parties.rows[0]!.n).toBe(3);
        const appeals = await db.execute(
          sql`SELECT count(*)::int AS n FROM appeals WHERE ruling_id = ${ruling.id}`,
        );
        expect(appeals.rows[0]!.n).toBe(1);

        // audit_events is append-only and survives reruns (ids restart, the
        // log does not), so assert on the latest event, not an exact count.
        const audit = await db.execute(sql`
          SELECT reason FROM audit_events
          WHERE action_key = 'rulings.expunge' AND entity_id = ${String(ruling.id)}
          ORDER BY id DESC LIMIT 1
        `);
        expect(audit.rows).toHaveLength(1);
        expect(audit.rows[0]).toMatchObject({ reason: 'sealed by court order' });
      });
    });

    describe('pardon', () => {
      let pardonable: RulingDetailView;

      it('is a distinct claim: the expunger cannot pardon and vice versa', async () => {
        const documentId = await createDocument(JUDGE);
        const response = await request(app)
          .post('/api/rulings')
          .set(as(JUDGE))
          .send({
            rulingDate: '2026-07-02',
            documentId,
            outcomeIds: [guiltyId],
            parties: [
              { partyType: 'government', side: 'plaintiff' },
              { partyType: 'user', side: 'defendant', robloxUserId: BUSINESS_OWNER },
            ],
          });
        expect(response.status).toBe(201);
        pardonable = response.body as RulingDetailView;

        expect(
          (
            await request(app)
              .post(`/api/rulings/${pardonable.id}/pardon`)
              .set(as(EXPUNGER))
              .send({ reason: 'nope' })
          ).status,
        ).toBe(403);
        expect(
          (
            await request(app)
              .post(`/api/rulings/${pardonable.id}/expunge`)
              .set(as(PRESIDENT))
              .send({ reason: 'nope' })
          ).status,
        ).toBe(403);
      });

      it('pardons under court:pardon with the same visibility semantics', async () => {
        const response = await request(app)
          .post(`/api/rulings/${pardonable.id}/pardon`)
          .set(as(PRESIDENT))
          .send({ reason: 'presidential clemency' });
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('pardoned');

        expect((await request(app).get(`/api/rulings/${pardonable.id}`)).status).toBe(404);
        const privileged = await request(app).get(`/api/rulings/${pardonable.id}`).set(as(JUDGE));
        expect(privileged.body.status).toBe('pardoned');

        // A settled (non-active) ruling cannot be moderated again — and it is
        // no longer even visible to the moderation claims.
        expect(
          (
            await request(app)
              .post(`/api/rulings/${pardonable.id}/pardon`)
              .set(as(PRESIDENT))
              .send({ reason: 'again' })
          ).status,
        ).toBe(404);
      });
    });
  });

  describe('outcome deletion', () => {
    it('refuses to delete outcomes referenced by court records', async () => {
      const inUse = await request(app)
        .delete(`/api/ruling-outcomes/${guiltyId}`)
        .set(as(VOCAB_ADMIN));
      expect(inUse.status).toBe(409);

      const unused = await request(app)
        .delete(`/api/ruling-outcomes/${notGuiltyId}`)
        .set(as(VOCAB_ADMIN));
      expect(unused.status).toBe(204);
    });
  });
});
