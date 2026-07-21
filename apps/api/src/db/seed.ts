/**
 * Dev-only demo data seeder. 
 * This script is run on demand (`npm run db:seed --workspace @aero/api`) against a local
 * stack to populate the public-facing pages with realistic bills, rulings,
 * businesses, rosters, tags, and votes.
 *
 * It reuses the real document pipeline (storePdfDocument), so every seeded PDF
 * is a genuine object in MinIO that renders in the sandboxed viewer. It is
 * re-runnable: demo rows are cleared first (append-only audit_events are left
 * intact by design). It refuses to run when NODE_ENV=production.
 */
import {
  BILL_STAGES,
  BILL_STATUSES,
  formatBillId,
  RULING_PARTY_SIDES,
  RULING_PARTY_TYPES,
  RULING_STATUSES,
  sessionForDate,
  VOTE_POSITIONS,
  type BillStage,
  type BillStatus,
  type VotePosition,
} from '@aero/shared';
import { eq, sql } from 'drizzle-orm';

import { config } from '../config.js';
import { logger } from '../logger.js';
import { storePdfDocument } from '../services/documents.js';
import { db, pool } from './client.js';
import {
  appealOutcomeLinks,
  appeals,
  billSequenceCounters,
  billStageEvents,
  billTags,
  billVersions,
  billVotes,
  bills,
  businessLicenses,
  businessLicenseTypes,
  businessOwnershipTransfers,
  businesses,
  congressRosters,
  documents,
  executiveOrders,
  rulingOutcomeLinks,
  rulingOutcomes,
  rulingParties,
  rulings,
  tags,
  users,
} from './schema.js';

// --- Minimal valid PDF generator -------------------------------------------

function escapePdf(text: string): string {
  return text.replace(/([\\()])/g, '\\$1');
}

/** Builds a one-page PDF (correct xref table) that pdf.js renders cleanly. */
function makePdf(title: string, body: string): Buffer {
  const content =
    `BT /F1 20 Tf 72 720 Td (${escapePdf(title)}) Tj ` +
    `0 -32 Td /F1 12 Tf (${escapePdf(body)}) Tj ET`;
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>',
    `<</Length ${Buffer.byteLength(content, 'latin1')}>>\nstream\n${content}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

async function seedPdf(uploaderUserId: number, filename: string, title: string): Promise<string> {
  const doc = await storePdfDocument({
    uploaderUserId,
    buffer: makePdf(title, `Seeded demo document — ${filename}`),
    originalFilename: filename,
    requestIp: null,
  });
  return doc.id;
}

// --- Demo cast --------------------------------------------------------------

// Platform users (must exist as rows: they own businesses, submit bills, enter
// rulings, and are referenced as ruling parties). The seeded admin (9725456)
// already exists from the claims migration and is reused, not re-created.
const ADMIN = 9725456;
const DEMO_USERS = [
  { robloxUserId: 200001, username: 'RepMorgan', displayName: 'Rep. Alex Morgan' },
  { robloxUserId: 200002, username: 'SenatorReyes', displayName: 'Sen. Diana Reyes' },
  { robloxUserId: 200003, username: 'JudgeHolt', displayName: 'Judge Ellis Holt' },
  { robloxUserId: 200004, username: 'AvaCitizen', displayName: 'Ava Bennett' },
  { robloxUserId: 200005, username: 'PresidentBlake', displayName: 'President Jordan Blake' },
];

// Roster members are attributed by ROBLOX id and need not be platform users.
const HOUSE_MEMBERS = [
  { robloxUserId: 200001, usernameSnapshot: 'RepMorgan', rank: 5 },
  { robloxUserId: 200011, usernameSnapshot: 'RepAllen', rank: 4 },
  { robloxUserId: 200012, usernameSnapshot: 'RepBrooks', rank: 4 },
  { robloxUserId: 200013, usernameSnapshot: 'RepChen', rank: 3 },
  { robloxUserId: 200014, usernameSnapshot: 'RepDiaz', rank: 3 },
];
const SENATE_MEMBERS = [
  { robloxUserId: 200002, usernameSnapshot: 'SenatorReyes', rank: 5 },
  { robloxUserId: 200021, usernameSnapshot: 'SenatorFord', rank: 4 },
  { robloxUserId: 200022, usernameSnapshot: 'SenatorGray', rank: 4 },
  { robloxUserId: 200023, usernameSnapshot: 'SenatorHale', rank: 3 },
];

/** Assigns positions across a chamber's members: mostly yea, a nay, an abstain. */
function votePattern(memberIds: number[]): { robloxUserId: number; position: VotePosition }[] {
  return memberIds.map((robloxUserId, i) => {
    let position: VotePosition = VOTE_POSITIONS.YEA;
    if (i === memberIds.length - 1) position = VOTE_POSITIONS.NAY;
    else if (i === memberIds.length - 2) position = VOTE_POSITIONS.ABSTAIN;
    return { robloxUserId, position };
  });
}

async function clearDemoData(): Promise<void> {
  // FK-safe order (children before parents). audit_events are append-only
  // (a DB trigger rejects DELETE) and are intentionally left untouched.
  await db.delete(billVotes);
  await db.delete(billTags);
  await db.delete(billStageEvents);
  await db.delete(billVersions);
  await db.delete(bills);
  await db.delete(billSequenceCounters);
  await db.delete(appealOutcomeLinks);
  await db.delete(appeals);
  await db.delete(rulingOutcomeLinks);
  await db.delete(rulingParties);
  await db.delete(rulings);
  await db.delete(executiveOrders);
  await db.delete(businessLicenses);
  await db.delete(businessOwnershipTransfers);
  await db.delete(businesses);
  await db.delete(businessLicenseTypes);
  await db.delete(congressRosters);
  await db.delete(tags);
  await db.delete(rulingOutcomes);
  await db.delete(documents);
}

async function seed(): Promise<void> {
  if (config.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data with NODE_ENV=production.');
  }

  const session = sessionForDate(new Date());
  const priorSession = session - 1;
  logger.info({ session }, 'seeding demo data');

  // Ensure demo users exist (refresh their display names on re-run).
  await db
    .insert(users)
    .values(DEMO_USERS)
    .onConflictDoUpdate({
      target: users.robloxUserId,
      set: {
        username: sqlExcluded('username'),
        displayName: sqlExcluded('display_name'),
      },
    });

  await clearDemoData();

  // --- Rosters --------------------------------------------------------------
  await db.insert(congressRosters).values([
    ...HOUSE_MEMBERS.map((m) => ({ chamber: 'house' as const, ...m })),
    ...SENATE_MEMBERS.map((m) => ({ chamber: 'senate' as const, ...m })),
  ]);

  // --- Tags -----------------------------------------------------------------
  const tagRows = await db
    .insert(tags)
    .values(
      [
        ['Infrastructure', 'Roads, transit, and public works'],
        ['Appropriations', 'Spending and budget'],
        ['Education', 'Schools and public learning'],
        ['Technology', 'Tech, internet, and digital policy'],
        ['Security', 'National and cyber security'],
        ['Healthcare', 'Public health and medicine'],
        ['Veterans', 'Veterans affairs'],
      ].map(([name, description]) => ({ name: name!, description })),
    )
    .returning();
  const tagId = (name: string): number => tagRows.find((t) => t.name === name)!.id;

  // --- Ruling outcome vocabulary -------------------------------------------
  const outcomeRows = await db
    .insert(rulingOutcomes)
    .values(
      ['guilty', 'not guilty', 'liable', 'not liable', 'dismissed'].map((name) => ({ name })),
    )
    .returning();
  const outcomeId = (name: string): number => outcomeRows.find((o) => o.name === name)!.id;

  // --- Businesses -----------------------------------------------------------
  const businessRows = await db
    .insert(businesses)
    .values([
      { name: 'Redwood Logistics LLC', ownerUserId: 200004, createdBy: ADMIN, status: 'active' },
      { name: 'Harbor Point Café', ownerUserId: 200004, createdBy: ADMIN, status: 'active' },
      { name: 'Summit Tech Industries', ownerUserId: 200002, createdBy: ADMIN, status: 'active' },
    ])
    .returning();
  const businessId = (name: string): number => businessRows.find((b) => b.name === name)!.id;

  // --- License types & licenses ----------------------------------------------
  const licenseTypeRows = await db
    .insert(businessLicenseTypes)
    .values(
      [
        ['Retail', 'General retail sales'],
        ['Food Service', 'Preparation and sale of food'],
        ['Transport', 'Commercial transport and freight'],
        ['Financial', 'Financial services and lending'],
      ].map(([name, description]) => ({ name: name!, description })),
    )
    .returning();
  const licenseTypeId = (name: string): number =>
    licenseTypeRows.find((t) => t.name === name)!.id;

  const inOneYear = new Date();
  inOneYear.setFullYear(inOneYear.getFullYear() + 1);
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  await db.insert(businessLicenses).values([
    // Active, never expires.
    {
      businessId: businessId('Redwood Logistics LLC'),
      licenseTypeId: licenseTypeId('Transport'),
      grantedBy: ADMIN,
    },
    // Active with a future expiry.
    {
      businessId: businessId('Harbor Point Café'),
      licenseTypeId: licenseTypeId('Food Service'),
      grantedBy: ADMIN,
      expiresAt: inOneYear,
    },
    // Revoked (renders with the audited reason).
    {
      businessId: businessId('Harbor Point Café'),
      licenseTypeId: licenseTypeId('Retail'),
      grantedBy: ADMIN,
      status: 'revoked' as const,
      revokedAt: lastMonth,
      revokedBy: ADMIN,
      revokeReason: 'Repeated health-code violations (demo).',
    },
    // Stored active but past expiry — derives as expired at read time.
    {
      businessId: businessId('Summit Tech Industries'),
      licenseTypeId: licenseTypeId('Financial'),
      grantedBy: ADMIN,
      expiresAt: lastMonth,
    },
  ]);

  // Ownership history: Summit Tech changed hands once.
  await db.insert(businessOwnershipTransfers).values({
    businessId: businessId('Summit Tech Industries'),
    fromUserId: 200004,
    toUserId: 200002,
    initiatedBy: 200004,
    reason: 'Sold the company (demo).',
  });

  // --- Executive Orders ------------------------------------------------------
  // PresidentBlake (200005) issues a chain that exercises every status:
  // active, a temporary order past expiry (derives expired), and a repeal pair.
  const PRESIDENT = 200005;
  async function seedEo(
    eoNumber: number,
    title: string,
    opts: { expiresAt?: Date; summary?: string | null } = {},
  ): Promise<number> {
    const docId = await seedPdf(ADMIN, `eo-${eoNumber}.pdf`, `Executive Order ${eoNumber}`);
    const [row] = await db
      .insert(executiveOrders)
      .values({
        eoNumber,
        title,
        summary: opts.summary ?? null,
        issuedBy: PRESIDENT,
        effectiveDate: '2026-05-01',
        expiresAt: opts.expiresAt ?? null,
        documentId: docId,
        createdBy: ADMIN,
      })
      .returning();
    if (!row) throw new Error(`EO ${eoNumber} insert failed`);
    return row.id;
  }

  await seedEo(1, 'Establishing the Office of Digital Services', {
    summary: 'Creates a central office to modernize federal digital infrastructure.',
  });
  await seedEo(2, 'Temporary Travel Advisory', {
    expiresAt: lastMonth, // active status but past expiry → renders "expired"
    summary: 'A time-limited advisory that has since lapsed.',
  });
  const eo3Id = await seedEo(3, 'Federal Data Standards', {
    summary: 'Sets baseline data-handling standards across agencies.',
  });
  const eo4Id = await seedEo(4, 'Repealing the Federal Data Standards Order', {
    summary: 'Rescinds EO #03 in full.',
  });
  // EO #04 repeals EO #03: flip the target and set the cross-link.
  await db
    .update(executiveOrders)
    .set({ status: 'repealed', repealedByEoId: eo4Id })
    .where(eq(executiveOrders.id, eo3Id));

  // --- Bills ----------------------------------------------------------------
  interface StageSpec {
    stage: BillStage;
    outcome: BillStatus;
    voters?: number[];
    decidedBy?: number | null;
  }
  interface BillSpec {
    chamber: 'H' | 'S';
    session: number;
    sequence: number;
    title: string;
    status: BillStatus;
    submittedBy: number;
    versions: number;
    tags: string[];
    stages: StageSpec[];
  }

  const houseIds = HOUSE_MEMBERS.map((m) => m.robloxUserId);
  const senateIds = SENATE_MEMBERS.map((m) => m.robloxUserId);

  const billSpecs: BillSpec[] = [
    {
      chamber: 'H',
      session,
      sequence: 1,
      title: 'Infrastructure Modernization Act',
      status: BILL_STATUSES.ENACTED,
      submittedBy: 200001,
      versions: 2,
      tags: ['Infrastructure', 'Appropriations'],
      stages: [
        { stage: BILL_STAGES.COMMITTEE, outcome: BILL_STATUSES.ORIGIN_FLOOR, voters: houseIds },
        { stage: BILL_STAGES.ORIGIN_FLOOR, outcome: BILL_STATUSES.OTHER_FLOOR, voters: houseIds },
        { stage: BILL_STAGES.OTHER_FLOOR, outcome: BILL_STATUSES.PRESIDENTIAL, voters: senateIds },
        { stage: BILL_STAGES.PRESIDENTIAL, outcome: BILL_STATUSES.ENACTED, decidedBy: 200005 },
      ],
    },
    {
      chamber: 'H',
      session,
      sequence: 2,
      title: 'Public Libraries Access Act',
      status: BILL_STATUSES.IN_COMMITTEE,
      submittedBy: 200001,
      versions: 1,
      tags: ['Education'],
      stages: [],
    },
    {
      chamber: 'S',
      session,
      sequence: 1,
      title: 'Coastal Cybersecurity Act',
      status: BILL_STATUSES.VETOED,
      submittedBy: 200002,
      versions: 1,
      tags: ['Technology', 'Security'],
      stages: [
        { stage: BILL_STAGES.COMMITTEE, outcome: BILL_STATUSES.ORIGIN_FLOOR, voters: senateIds },
        { stage: BILL_STAGES.ORIGIN_FLOOR, outcome: BILL_STATUSES.OTHER_FLOOR, voters: senateIds },
        { stage: BILL_STAGES.OTHER_FLOOR, outcome: BILL_STATUSES.PRESIDENTIAL, voters: houseIds },
        { stage: BILL_STAGES.PRESIDENTIAL, outcome: BILL_STATUSES.VETOED, decidedBy: 200005 },
      ],
    },
    {
      chamber: 'S',
      session,
      sequence: 2,
      title: 'Veterans Healthcare Expansion Act',
      status: BILL_STATUSES.ENACTED_BY_OVERRIDE,
      submittedBy: 200002,
      versions: 2,
      tags: ['Healthcare', 'Veterans'],
      stages: [
        { stage: BILL_STAGES.COMMITTEE, outcome: BILL_STATUSES.ORIGIN_FLOOR, voters: senateIds },
        { stage: BILL_STAGES.ORIGIN_FLOOR, outcome: BILL_STATUSES.OTHER_FLOOR, voters: senateIds },
        { stage: BILL_STAGES.OTHER_FLOOR, outcome: BILL_STATUSES.PRESIDENTIAL, voters: houseIds },
        { stage: BILL_STAGES.PRESIDENTIAL, outcome: BILL_STATUSES.VETOED, decidedBy: 200005 },
        {
          stage: BILL_STAGES.VETO_OVERRIDE,
          outcome: BILL_STATUSES.ENACTED_BY_OVERRIDE,
          voters: senateIds,
        },
      ],
    },
    {
      chamber: 'H',
      session: priorSession,
      sequence: 1,
      title: 'Rural Broadband Act',
      status: BILL_STATUSES.DIED_IN_SESSION,
      submittedBy: 200001,
      versions: 1,
      tags: ['Technology'],
      stages: [
        { stage: BILL_STAGES.COMMITTEE, outcome: BILL_STATUSES.ORIGIN_FLOOR, voters: houseIds },
        // System-decided death at session rollover (decidedBy null).
        { stage: BILL_STAGES.ORIGIN_FLOOR, outcome: BILL_STATUSES.DIED_IN_SESSION, decidedBy: null },
      ],
    },
  ];

  for (const spec of billSpecs) {
    const displayId = formatBillId(spec.chamber, spec.session, spec.sequence);
    const [bill] = await db
      .insert(bills)
      .values({
        chamber: spec.chamber,
        session: spec.session,
        sequence: spec.sequence,
        title: spec.title,
        status: spec.status,
        submittedBy: spec.submittedBy,
      })
      .returning();
    if (!bill) throw new Error(`bill insert failed for ${displayId}`);

    // Versioned PDFs.
    for (let v = 1; v <= spec.versions; v++) {
      const docId = await seedPdf(
        spec.submittedBy,
        `${displayId}-v${v}.pdf`,
        `${displayId} — ${spec.title} (v${v})`,
      );
      await db.insert(billVersions).values({
        billId: bill.id,
        versionNo: v,
        documentId: docId,
        uploadedBy: spec.submittedBy,
      });
    }

    // Stage pipeline + per-member votes.
    for (const stage of spec.stages) {
      const [event] = await db
        .insert(billStageEvents)
        .values({
          billId: bill.id,
          stage: stage.stage,
          outcome: stage.outcome,
          decidedBy: stage.decidedBy === undefined ? ADMIN : stage.decidedBy,
        })
        .returning();
      if (!event) throw new Error(`stage event insert failed for ${displayId}`);
      if (stage.voters?.length) {
        await db.insert(billVotes).values(
          votePattern(stage.voters).map((v) => ({
            stageEventId: event.id,
            robloxUserId: v.robloxUserId,
            position: v.position,
            recordedBy: ADMIN,
          })),
        );
      }
    }

    // Tags.
    if (spec.tags.length) {
      await db
        .insert(billTags)
        .values(spec.tags.map((name) => ({ billId: bill.id, tagId: tagId(name) })));
    }

    // Keep the per-(chamber, session) counter ahead of seeded sequences so
    // real submissions don't collide with demo bill ids.
    await db
      .insert(billSequenceCounters)
      .values({ chamber: spec.chamber, session: spec.session, lastSequence: spec.sequence })
      .onConflictDoUpdate({
        target: [billSequenceCounters.chamber, billSequenceCounters.session],
        set: { lastSequence: sqlGreatest('last_sequence', spec.sequence) },
      });

    logger.info({ bill: displayId, status: spec.status }, 'seeded bill');
  }

  // --- Rulings --------------------------------------------------------------
  interface PartySpec {
    side: (typeof RULING_PARTY_SIDES)[keyof typeof RULING_PARTY_SIDES];
    type: (typeof RULING_PARTY_TYPES)[keyof typeof RULING_PARTY_TYPES];
    robloxUserId?: number;
    businessName?: string;
  }
  interface RulingSpec {
    date: string;
    status: (typeof RULING_STATUSES)[keyof typeof RULING_STATUSES];
    title: string;
    outcomes: string[];
    parties: PartySpec[];
    appeal?: { title: string; outcomes: string[] };
  }

  const G = RULING_PARTY_TYPES.GOVERNMENT;
  const U = RULING_PARTY_TYPES.USER;
  const B = RULING_PARTY_TYPES.BUSINESS;
  const P = RULING_PARTY_SIDES.PLAINTIFF;
  const D = RULING_PARTY_SIDES.DEFENDANT;

  const rulingSpecs: RulingSpec[] = [
    {
      date: '2026-07-06',
      status: RULING_STATUSES.ACTIVE,
      title: 'United States v. Bennett',
      outcomes: ['guilty'],
      parties: [
        { side: P, type: G },
        { side: D, type: U, robloxUserId: 200004 },
      ],
    },
    {
      date: '2026-06-22',
      status: RULING_STATUSES.ACTIVE,
      title: 'Summit Tech Industries v. Redwood Logistics LLC',
      outcomes: ['liable'],
      parties: [
        { side: P, type: B, businessName: 'Summit Tech Industries' },
        { side: D, type: B, businessName: 'Redwood Logistics LLC' },
      ],
      appeal: { title: 'Supreme Court verdict — reversed', outcomes: ['not liable'] },
    },
    {
      date: '2026-05-14',
      status: RULING_STATUSES.ACTIVE,
      title: 'Bennett v. United States',
      outcomes: ['dismissed'],
      parties: [
        { side: P, type: U, robloxUserId: 200004 },
        { side: D, type: G },
      ],
    },
    {
      date: '2026-04-02',
      status: RULING_STATUSES.EXPUNGED,
      title: 'United States v. Bennett (sealed)',
      outcomes: ['not guilty'],
      parties: [
        { side: P, type: G },
        { side: D, type: U, robloxUserId: 200004 },
      ],
    },
  ];

  for (const spec of rulingSpecs) {
    const docId = await seedPdf(200003, `judgment-${spec.date}.pdf`, spec.title);
    const [ruling] = await db
      .insert(rulings)
      .values({
        rulingDate: spec.date,
        status: spec.status,
        enteredBy: 200003,
        documentId: docId,
      })
      .returning();
    if (!ruling) throw new Error(`ruling insert failed: ${spec.title}`);

    await db.insert(rulingParties).values(
      spec.parties.map((party) => ({
        rulingId: ruling.id,
        side: party.side,
        partyType: party.type,
        robloxUserId: party.type === U ? party.robloxUserId! : null,
        businessId: party.type === B ? businessId(party.businessName!) : null,
      })),
    );

    if (spec.outcomes.length) {
      await db
        .insert(rulingOutcomeLinks)
        .values(spec.outcomes.map((name) => ({ rulingId: ruling.id, outcomeId: outcomeId(name) })));
    }

    if (spec.appeal) {
      const appealDocId = await seedPdf(200003, `appeal-${spec.date}.pdf`, spec.appeal.title);
      const [appeal] = await db
        .insert(appeals)
        .values({ rulingId: ruling.id, documentId: appealDocId, enteredBy: 200003 })
        .returning();
      if (!appeal) throw new Error(`appeal insert failed: ${spec.title}`);
      await db
        .insert(appealOutcomeLinks)
        .values(
          spec.appeal.outcomes.map((name) => ({ appealId: appeal.id, outcomeId: outcomeId(name) })),
        );
    }

    logger.info({ ruling: spec.title, status: spec.status }, 'seeded ruling');
  }

  logger.info(
    { bills: billSpecs.length, rulings: rulingSpecs.length, businesses: businessRows.length },
    'demo data seeded',
  );
}

// Tiny raw-SQL helpers for the upserts above. `value` is always a literal
// integer here, so interpolation into raw SQL is safe.
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}
function sqlGreatest(column: string, value: number) {
  return sql.raw(`GREATEST(bill_sequence_counters.${column}, ${value})`);
}

seed()
  .then(() => pool.end())
  .then(() => {
    logger.info('seed complete');
    process.exit(0);
  })
  .catch((error: unknown) => {
    logger.error({ error }, 'seed failed');
    void pool.end();
    process.exit(1);
  });
