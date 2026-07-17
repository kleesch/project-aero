import { createHmac } from 'node:crypto';

import {
  BILL_STATUSES,
  CLAIM_KEYS,
  formatBillId,
  sessionForDate,
  type BillDetailView,
} from '@aero/shared';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * End-to-end tests against a real Postgres (unit tests everywhere else stay
 * hermetic). Gated on TEST_DATABASE_URL and skipped without it:
 *
 *   docker compose up -d postgres
 *   npm run test:integration --workspace @aero/api
 *
 * The database named in the URL is created if missing and its bill-domain
 * tables are truncated at startup — point it at a disposable database, never
 * at development data.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';

// Deterministic test identities (roblox user ids).
const SUBMITTER = 1001; // house roster + bill:submit
const HOUSE_CLERK = 1002; // bill:vote-update:house (+ bill:submit, but no roster)
const SENATE_CLERK = 1003; // bill:vote-update:senate
const PRESIDENT = 1004; // bill:sign
const SENATOR = 1005; // senate roster + bill:submit
const TAG_ADMIN = 1006; // tags:manage
const RANDO = 1007; // no claims
const HOUSE_MEMBERS = [111, 112, 113]; // roster-only, never logged in
const SENATE_MEMBERS = [211, 212];

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

describe.runIf(Boolean(TEST_DATABASE_URL))('bill tracking (integration)', () => {
  // Everything API-side is imported dynamically after DATABASE_URL points at
  // the test database — config.ts reads the environment at first import.
  let db: (typeof import('../db/client.js'))['db'];
  let pool: (typeof import('../db/client.js'))['pool'];
  let schema: typeof import('../db/schema.js');
  let app: import('express').Express;
  let rollover: typeof import('../services/session-rollover.js');

  const sessions = new Map<number, string>();
  const currentSession = sessionForDate(new Date());

  function cookieFor(userId: number): string {
    const token = sessions.get(userId);
    if (!token) throw new Error(`no session for user ${userId}`);
    // cookie-parser signed-cookie format, signed with the vitest SESSION_SECRET.
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
        sha256: 'a'.repeat(64),
        mime: 'application/pdf',
        displayFilename: 'bill.pdf',
      })
      .returning({ id: schema.documents.id });
    return row!.id;
  }

  async function submitHouseBill(title: string): Promise<BillDetailView> {
    const documentId = await createDocument(SUBMITTER);
    const response = await request(app)
      .post('/api/bills')
      .set(as(SUBMITTER))
      .send({ title, documentId });
    expect(response.status).toBe(201);
    return response.body as BillDetailView;
  }

  async function transition(actor: number, ref: string | number, toStatus: string, notes?: string) {
    return request(app)
      .post(`/api/bills/${ref}/transition`)
      .set(as(actor))
      .send({ toStatus, ...(notes ? { notes } : {}) });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.LOG_LEVEL = 'warn';
    await ensureDatabase(TEST_DATABASE_URL);

    const migrate = await import('../db/migrate.js');
    await migrate.runMigrations();
    ({ db, pool } = await import('../db/client.js'));
    schema = await import('../db/schema.js');
    rollover = await import('../services/session-rollover.js');
    const { createApp } = await import('../app.js');
    app = createApp();

    // Reset the bill domain. audit_events is append-only (trigger-enforced)
    // and users rows may be referenced by old audit rows, so neither is
    // truncated; users are upserted and grants below get cleared by id.
    await db.execute(sql`
      TRUNCATE bill_votes, bill_stage_events, bill_versions, bill_tags, bills,
        bill_sequence_counters, tags, congress_rosters, roster_rank_rules, documents
      RESTART IDENTITY CASCADE
    `);
    await db.execute(sql`DELETE FROM sessions`);
    await db.execute(sql`DELETE FROM user_group_cache`);
    await db.execute(sql`DELETE FROM direct_claim_grants WHERE user_id < 10000`);

    const testUsers = [SUBMITTER, HOUSE_CLERK, SENATE_CLERK, PRESIDENT, SENATOR, TAG_ADMIN, RANDO];
    await db
      .insert(schema.users)
      .values(testUsers.map((id) => ({ robloxUserId: id, username: `user${id}` })))
      .onConflictDoNothing();
    // Fresh empty group caches so claim resolution never calls ROBLOX.
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
        grant(SUBMITTER, CLAIM_KEYS.BILL_SUBMIT),
        grant(HOUSE_CLERK, CLAIM_KEYS.BILL_SUBMIT),
        grant(HOUSE_CLERK, CLAIM_KEYS.BILL_VOTE_UPDATE_HOUSE),
        grant(SENATE_CLERK, CLAIM_KEYS.BILL_VOTE_UPDATE_SENATE),
        grant(PRESIDENT, CLAIM_KEYS.BILL_SIGN),
        grant(SENATOR, CLAIM_KEYS.BILL_SUBMIT),
        grant(TAG_ADMIN, CLAIM_KEYS.TAGS_MANAGE),
      ]);

    await db.insert(schema.congressRosters).values([
      { chamber: 'house', robloxUserId: SUBMITTER, usernameSnapshot: 'user1001', rank: 100 },
      { chamber: 'senate', robloxUserId: SENATOR, usernameSnapshot: 'user1005', rank: 200 },
      ...HOUSE_MEMBERS.map((id) => ({
        chamber: 'house' as const,
        robloxUserId: id,
        usernameSnapshot: `rep${id}`,
        rank: 90,
      })),
      ...SENATE_MEMBERS.map((id) => ({
        chamber: 'senate' as const,
        robloxUserId: id,
        usernameSnapshot: `sen${id}`,
        rank: 190,
      })),
    ]);

    const { createSession } = await import('../auth/sessions.js');
    for (const id of testUsers) {
      sessions.set(id, (await createSession(id)).token);
    }
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  it('serves the bill list to anonymous users', async () => {
    const response = await request(app).get('/api/bills');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [], total: 0 });
  });

  it('rejects submission without the bill:submit claim', async () => {
    const documentId = await createDocument(SUBMITTER);
    const response = await request(app)
      .post('/api/bills')
      .set(as(RANDO))
      .send({ title: 'Unauthorized Act', documentId });
    expect(response.status).toBe(403);
  });

  it('rejects submission from a claim holder on no roster', async () => {
    const documentId = await createDocument(HOUSE_CLERK);
    const response = await request(app)
      .post('/api/bills')
      .set(as(HOUSE_CLERK))
      .send({ title: 'Rosterless Act', documentId });
    expect(response.status).toBe(422);
    expect(response.body.error).toMatch(/roster/i);
  });

  it('never collides on (chamber, session, sequence) under concurrent submissions', async () => {
    const documentIds = await Promise.all(
      Array.from({ length: 12 }, () => createDocument(SUBMITTER)),
    );
    const responses = await Promise.all(
      documentIds.map((documentId, index) =>
        request(app)
          .post('/api/bills')
          .set(as(SUBMITTER))
          .send({ title: `Concurrent Act ${index + 1}`, documentId }),
      ),
    );
    for (const response of responses) expect(response.status).toBe(201);

    const bodies = responses.map((response) => response.body as BillDetailView);
    const sequences = bodies.map((body) => body.sequence).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    for (const body of bodies) {
      expect(body.chamber).toBe('house');
      expect(body.session).toBe(currentSession);
      expect(body.displayId).toBe(formatBillId('H', currentSession, body.sequence));
      expect(body.status).toBe(BILL_STATUSES.IN_COMMITTEE);
      expect(body.versions).toHaveLength(1);
    }
  }, 30_000);

  it('rejects the 100th bill of a session with a clear error', async () => {
    await db
      .insert(schema.billSequenceCounters)
      .values({ chamber: 'S', session: currentSession, lastSequence: 99 })
      .onConflictDoUpdate({
        target: [schema.billSequenceCounters.chamber, schema.billSequenceCounters.session],
        set: { lastSequence: 99 },
      });
    const documentId = await createDocument(SENATOR);
    const response = await request(app)
      .post('/api/bills')
      .set(as(SENATOR))
      .send({ title: 'One Act Too Many', documentId });
    expect(response.status).toBe(422);
    expect(response.body.error).toMatch(/99/);
  });

  describe('the full pipeline: veto and override', () => {
    let bill: BillDetailView;

    it('submits the bill', async () => {
      bill = await submitHouseBill('Veto Override Act');
      expect(bill.legalNextStatuses).toEqual([
        BILL_STATUSES.ORIGIN_FLOOR,
        BILL_STATUSES.FAILED_COMMITTEE,
      ]);
    });

    it('rejects an illegal committee → presidential jump', async () => {
      const response = await transition(HOUSE_CLERK, bill.displayId, BILL_STATUSES.PRESIDENTIAL);
      expect(response.status).toBe(409);
      expect(response.body.legalNextStatuses).toContain(BILL_STATUSES.ORIGIN_FLOOR);
    });

    it('rejects DIED_IN_SESSION as a user-declared outcome', async () => {
      const response = await transition(HOUSE_CLERK, bill.displayId, BILL_STATUSES.DIED_IN_SESSION);
      expect(response.status).toBe(422);
    });

    it('enforces the origin chamber claim on committee outcomes', async () => {
      expect((await transition(RANDO, bill.displayId, BILL_STATUSES.ORIGIN_FLOOR)).status).toBe(
        403,
      );
      expect(
        (await transition(SENATE_CLERK, bill.displayId, BILL_STATUSES.ORIGIN_FLOOR)).status,
      ).toBe(403);

      const response = await transition(
        HOUSE_CLERK,
        bill.displayId,
        BILL_STATUSES.ORIGIN_FLOOR,
        'Passed committee 2–1.',
      );
      expect(response.status).toBe(200);
      const detail = response.body as BillDetailView;
      expect(detail.status).toBe(BILL_STATUSES.ORIGIN_FLOOR);
      expect(detail.stageEvents).toHaveLength(1);
      expect(detail.stageEvents[0]).toMatchObject({
        stage: 'COMMITTEE',
        outcome: BILL_STATUSES.ORIGIN_FLOOR,
        acceptsVotes: true,
      });
      bill = detail;
    });

    it('records committee votes against the house roster', async () => {
      const eventId = bill.stageEvents[0]!.id;
      const votes = [
        { robloxUserId: 111, position: 'yea' },
        { robloxUserId: 112, position: 'yea' },
        { robloxUserId: 113, position: 'nay' },
      ];

      const wrongChamber = await request(app)
        .post(`/api/bills/${bill.id}/stage-events/${eventId}/votes`)
        .set(as(SENATE_CLERK))
        .send({ votes });
      expect(wrongChamber.status).toBe(403);

      const response = await request(app)
        .post(`/api/bills/${bill.id}/stage-events/${eventId}/votes`)
        .set(as(HOUSE_CLERK))
        .send({ votes });
      expect(response.status).toBe(200);
      expect(response.body.recorded).toBe(3);
      expect(response.body.stageEvent.tally).toEqual({ yea: 2, nay: 1, abstain: 0, absent: 0 });
      // Roster-snapshot hydration: rep111 has never logged in.
      const memberNames = response.body.stageEvent.votes.map(
        (vote: { member: { username: string | null } }) => vote.member.username,
      );
      expect(memberNames).toContain('rep111');
    });

    it('requires explicit confirmation for off-roster members', async () => {
      const eventId = bill.stageEvents[0]!.id;
      const votes = [{ robloxUserId: 999, position: 'absent' }];

      const unconfirmed = await request(app)
        .post(`/api/bills/${bill.id}/stage-events/${eventId}/votes`)
        .set(as(HOUSE_CLERK))
        .send({ votes });
      expect(unconfirmed.status).toBe(422);
      expect(unconfirmed.body.offRosterUserIds).toEqual([999]);

      const confirmed = await request(app)
        .post(`/api/bills/${bill.id}/stage-events/${eventId}/votes`)
        .set(as(HOUSE_CLERK))
        .send({ votes, confirmOffRoster: true });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.stageEvent.tally).toEqual({ yea: 2, nay: 1, abstain: 0, absent: 1 });
    });

    it('corrects a vote by superseding, never mutating, and audits both entries', async () => {
      const eventId = bill.stageEvents[0]!.id;
      const response = await request(app)
        .post(`/api/bills/${bill.id}/stage-events/${eventId}/votes`)
        .set(as(HOUSE_CLERK))
        .send({ votes: [{ robloxUserId: 112, position: 'nay' }] });
      expect(response.status).toBe(200);
      expect(response.body.superseded).toBe(1);
      expect(response.body.stageEvent.tally).toEqual({ yea: 1, nay: 2, abstain: 0, absent: 1 });

      // Both rows survive; the old one points at its replacement.
      const rows = await db.execute(sql`
        SELECT position, superseded_by FROM bill_votes
        WHERE stage_event_id = ${eventId} AND roblox_user_id = 112
        ORDER BY id
      `);
      expect(rows.rows).toHaveLength(2);
      expect(rows.rows[0]).toMatchObject({ position: 'yea' });
      expect(rows.rows[0]!.superseded_by).not.toBeNull();
      expect(rows.rows[1]).toMatchObject({ position: 'nay', superseded_by: null });

      const auditRows = await db.execute(sql`
        SELECT count(*)::int AS events FROM audit_events
        WHERE action_key = 'bills.votes.record' AND entity_id = ${String(bill.id)}
      `);
      expect(Number(auditRows.rows[0]!.events)).toBeGreaterThanOrEqual(3);
    });

    it('walks both floors with per-chamber claims', async () => {
      const floor = await transition(HOUSE_CLERK, bill.displayId, BILL_STATUSES.OTHER_FLOOR);
      expect(floor.status).toBe(200);

      // The other floor belongs to the senate: the house clerk is refused.
      expect(
        (await transition(HOUSE_CLERK, bill.displayId, BILL_STATUSES.PRESIDENTIAL)).status,
      ).toBe(403);
      const other = await transition(SENATE_CLERK, bill.displayId, BILL_STATUSES.PRESIDENTIAL);
      expect(other.status).toBe(200);
      bill = other.body as BillDetailView;

      // Senate floor votes, gated by the senate claim.
      const otherFloorEvent = bill.stageEvents.find((event) => event.stage === 'OTHER_FLOOR')!;
      const houseAttempt = await request(app)
        .post(`/api/bills/${bill.id}/stage-events/${otherFloorEvent.id}/votes`)
        .set(as(HOUSE_CLERK))
        .send({ votes: [{ robloxUserId: 211, position: 'yea' }] });
      expect(houseAttempt.status).toBe(403);
      const senateVotes = await request(app)
        .post(`/api/bills/${bill.id}/stage-events/${otherFloorEvent.id}/votes`)
        .set(as(SENATE_CLERK))
        .send({
          votes: [
            { robloxUserId: 211, position: 'yea' },
            { robloxUserId: 212, position: 'abstain' },
          ],
        });
      expect(senateVotes.status).toBe(200);
    });

    it('reserves sign/veto for bill:sign, even against chamber-claim holders', async () => {
      expect((await transition(HOUSE_CLERK, bill.displayId, BILL_STATUSES.VETOED)).status).toBe(
        403,
      );
      expect((await transition(SENATE_CLERK, bill.displayId, BILL_STATUSES.ENACTED)).status).toBe(
        403,
      );

      const veto = await transition(PRESIDENT, bill.displayId, BILL_STATUSES.VETOED, 'No.');
      expect(veto.status).toBe(200);
      expect((veto.body as BillDetailView).status).toBe(BILL_STATUSES.VETOED);
    });

    it('returns the override to the origin chamber and enacts over the veto', async () => {
      // The president holds no house vote-update claim: not their call.
      expect(
        (await transition(PRESIDENT, bill.displayId, BILL_STATUSES.VETO_OVERRIDE)).status,
      ).toBe(403);

      const started = await transition(HOUSE_CLERK, bill.displayId, BILL_STATUSES.VETO_OVERRIDE);
      expect(started.status).toBe(200);

      const overrideEvent = (started.body as BillDetailView).stageEvents.find(
        (event) => event.stage === 'VETO_OVERRIDE',
      )!;
      const overrideVotes = await request(app)
        .post(`/api/bills/${bill.id}/stage-events/${overrideEvent.id}/votes`)
        .set(as(HOUSE_CLERK))
        .send({
          votes: HOUSE_MEMBERS.map((robloxUserId) => ({ robloxUserId, position: 'yea' })),
        });
      expect(overrideVotes.status).toBe(200);
      expect(overrideVotes.body.stageEvent.tally.yea).toBe(3);

      const enacted = await transition(
        HOUSE_CLERK,
        bill.displayId,
        BILL_STATUSES.ENACTED_BY_OVERRIDE,
      );
      expect(enacted.status).toBe(200);
      expect((enacted.body as BillDetailView).status).toBe(BILL_STATUSES.ENACTED_BY_OVERRIDE);

      // Terminal: nothing moves it again.
      expect(
        (await transition(HOUSE_CLERK, bill.displayId, BILL_STATUSES.IN_COMMITTEE)).status,
      ).toBe(409);
    });

    it('shows the whole history — stages, votes, versions — to anonymous users', async () => {
      const response = await request(app).get(`/api/bills/${bill.displayId}`);
      expect(response.status).toBe(200);
      const detail = response.body as BillDetailView;
      expect(detail.status).toBe(BILL_STATUSES.ENACTED_BY_OVERRIDE);
      expect(detail.stageEvents.map((event) => event.stage)).toEqual([
        'COMMITTEE',
        'ORIGIN_FLOOR',
        'OTHER_FLOOR',
        'PRESIDENTIAL',
        'VETO_OVERRIDE',
        'VETO_OVERRIDE',
      ]);
      expect(detail.stageEvents[0]!.tally).toEqual({ yea: 1, nay: 2, abstain: 0, absent: 1 });
      expect(detail.versions[0]!.document.fileUrl).toMatch(/\/files\//);
    });
  });

  describe('versions', () => {
    it('appends a new PDF version between stages', async () => {
      const bill = await submitHouseBill('Amended Act');
      const documentId = await createDocument(SUBMITTER);
      const response = await request(app)
        .post(`/api/bills/${bill.id}/versions`)
        .set(as(SUBMITTER))
        .send({ documentId });
      expect(response.status).toBe(201);
      const detail = response.body as BillDetailView;
      expect(detail.versions.map((version) => version.versionNo)).toEqual([1, 2]);
    });

    it('rejects versions on settled bills and documents owned by others', async () => {
      const bill = await submitHouseBill('Settled Act');
      await transition(HOUSE_CLERK, bill.id, BILL_STATUSES.FAILED_COMMITTEE);
      const documentId = await createDocument(SUBMITTER);
      const settled = await request(app)
        .post(`/api/bills/${bill.id}/versions`)
        .set(as(SUBMITTER))
        .send({ documentId });
      expect(settled.status).toBe(409);

      const active = await submitHouseBill('Active Act');
      const foreignDocument = await createDocument(HOUSE_CLERK);
      const foreign = await request(app)
        .post(`/api/bills/${active.id}/versions`)
        .set(as(SUBMITTER))
        .send({ documentId: foreignDocument });
      expect(foreign.status).toBe(422);
    });
  });

  describe('tags', () => {
    let tagId: number;

    it('manages the vocabulary under tags:manage', async () => {
      expect(
        (await request(app).post('/api/tags').set(as(RANDO)).send({ name: 'nope' })).status,
      ).toBe(403);
      const created = await request(app)
        .post('/api/tags')
        .set(as(TAG_ADMIN))
        .send({ name: 'appropriations', description: 'Spending bills' });
      expect(created.status).toBe(201);
      tagId = created.body.id;

      const anonymous = await request(app).get('/api/tags');
      expect(anonymous.status).toBe(200);
      expect(anonymous.body).toHaveLength(1);
    });

    it('applies tags at submission and by replacement, and filters the list', async () => {
      const documentId = await createDocument(SUBMITTER);
      const submitted = await request(app)
        .post('/api/bills')
        .set(as(SUBMITTER))
        .send({ title: 'Tagged Act', documentId, tagIds: [tagId] });
      expect(submitted.status).toBe(201);
      expect((submitted.body as BillDetailView).tags[0]).toMatchObject({
        name: 'appropriations',
      });

      const filtered = await request(app).get(`/api/bills?tags=${tagId}`);
      expect(filtered.status).toBe(200);
      expect(filtered.body.total).toBe(1);
      expect(filtered.body.items[0].title).toBe('Tagged Act');

      const cleared = await request(app)
        .put(`/api/bills/${submitted.body.id}/tags`)
        .set(as(SUBMITTER))
        .send({ tagIds: [] });
      expect(cleared.status).toBe(200);
      const refiltered = await request(app).get(`/api/bills?tags=${tagId}`);
      expect(refiltered.body.total).toBe(0);
    });
  });

  describe('list filters and search', () => {
    it('searches by display id and by title', async () => {
      const byId = await request(app).get(`/api/bills?q=${formatBillId('H', currentSession, 1)}`);
      expect(byId.status).toBe(200);
      expect(byId.body.total).toBe(1);
      expect(byId.body.items[0].sequence).toBe(1);

      const byTitle = await request(app).get('/api/bills?q=Veto Override');
      expect(byTitle.body.total).toBe(1);
      expect(byTitle.body.items[0].title).toBe('Veto Override Act');
    });

    it('filters by status and chamber', async () => {
      const failed = await request(app).get('/api/bills?status=FAILED_COMMITTEE');
      expect(failed.body.total).toBe(1);
      const senate = await request(app).get('/api/bills?chamber=senate');
      expect(senate.body.total).toBe(0);
    });
  });

  // Last on purpose: the simulated next-month sweep kills every still-active
  // bill the earlier tests left behind.
  describe('session rollover', () => {
    it('kills prior-session active bills and leaves settled ones untouched', async () => {
      const [staleActive] = await db
        .insert(schema.bills)
        .values({
          chamber: 'H',
          session: currentSession - 1,
          sequence: 98,
          title: 'Stale Active Act',
          status: BILL_STATUSES.ORIGIN_FLOOR,
          submittedBy: SUBMITTER,
        })
        .returning();
      const [staleEnacted] = await db
        .insert(schema.bills)
        .values({
          chamber: 'H',
          session: currentSession - 1,
          sequence: 99,
          title: 'Stale Enacted Act',
          status: BILL_STATUSES.ENACTED,
          submittedBy: SUBMITTER,
        })
        .returning();

      const died = await rollover.rolloverExpiredBills();
      expect(died).toBe(1);

      const active = await request(app).get(`/api/bills/${staleActive!.id}`);
      expect(active.body.status).toBe(BILL_STATUSES.DIED_IN_SESSION);
      const deathEvent = (active.body as BillDetailView).stageEvents.at(-1)!;
      expect(deathEvent.outcome).toBe(BILL_STATUSES.DIED_IN_SESSION);
      expect(deathEvent.decidedBy).toBeNull(); // the system, not a user

      const enacted = await request(app).get(`/api/bills/${staleEnacted!.id}`);
      expect(enacted.body.status).toBe(BILL_STATUSES.ENACTED);
    });

    it('blocks mutations on expired bills via the lazy guard', async () => {
      const [expired] = await db
        .insert(schema.bills)
        .values({
          chamber: 'H',
          session: currentSession - 1,
          sequence: 97,
          title: 'Lazily Dead Act',
          status: BILL_STATUSES.IN_COMMITTEE,
          submittedBy: SUBMITTER,
        })
        .returning();

      const response = await transition(HOUSE_CLERK, expired!.id, BILL_STATUSES.ORIGIN_FLOOR);
      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/died/i);

      const detail = await request(app).get(`/api/bills/${expired!.id}`);
      expect(detail.body.status).toBe(BILL_STATUSES.DIED_IN_SESSION);
    });

    it('kills active bills at a simulated month rollover', async () => {
      const fresh = await submitHouseBill('Doomed Act');
      const nextMonth = new Date();
      nextMonth.setUTCDate(15);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);

      await rollover.rolloverExpiredBills(nextMonth);

      const detail = await request(app).get(`/api/bills/${fresh.id}`);
      expect(detail.body.status).toBe(BILL_STATUSES.DIED_IN_SESSION);

      // Terminal bills from the pipeline runs stay exactly as they ended.
      const enactedList = await request(app).get(
        `/api/bills?status=${BILL_STATUSES.ENACTED_BY_OVERRIDE}`,
      );
      expect(enactedList.body.total).toBe(1);
    });
  });
});
