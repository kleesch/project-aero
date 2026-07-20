import {
  ALL_BILL_STAGES,
  ALL_BILL_STATUSES,
  ALL_CHAMBERS,
  ALL_LICENSE_STATUSES,
  ALL_RULING_PARTY_SIDES,
  ALL_RULING_PARTY_TYPES,
  ALL_RULING_STATUSES,
  ALL_VOTE_POSITIONS,
  type BillStage,
  type BillStatus,
  type BusinessStatus,
  type Chamber,
  type ChamberCode,
  type LicenseStatus,
  type RulingPartySide,
  type RulingPartyType,
  type RulingStatus,
  type VotePosition,
} from '@aero/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/**
 * The ROBLOX user id is the primary identity; username/display name/avatar
 * are cached snapshots refreshed at login (see DESIGN.md — Core).
 */
export const users = pgTable('users', {
  robloxUserId: bigint('roblox_user_id', { mode: 'number' }).primaryKey(),
  username: text('username').notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Server-side sessions (see DESIGN.md — Authentication & Sessions). The
 * browser cookie carries the raw session token; only its SHA-256 hash is
 * stored, so a database leak cannot be replayed as live sessions. Sliding
 * expiry, hourly cleanup job.
 */
export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 hex digest of the session token. */
    tokenHash: text('token_hash').primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.robloxUserId),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

/**
 * Registry of claim keys admins can see and map. The keys themselves are
 * constants in packages/shared (see DESIGN.md — Claims & Permissions); this
 * table carries descriptions and is seeded from the registry.
 */
export const claimDefinitions = pgTable('claim_definitions', {
  key: text('key').primaryKey(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rankComparison = pgEnum('rank_comparison', ['>=', '==', '<=']);

/**
 * A user holds the claim if their rank in the ROBLOX group satisfies the
 * comparison; multiple mappings per claim are OR'd.
 */
export const groupClaimMappings = pgTable(
  'group_claim_mappings',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    claimKey: text('claim_key')
      .notNull()
      .references(() => claimDefinitions.key),
    groupId: bigint('group_id', { mode: 'number' }).notNull(),
    comparison: rankComparison('comparison').notNull(),
    rankValue: integer('rank_value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('group_claim_mappings_claim_key_idx').on(table.claimKey)],
);

/**
 * Positive grants add a claim; negative grants block it unconditionally.
 * Revocation is a soft update so the grant history stays auditable. Negative
 * grants are always read live, never through any cache — see the claim
 * resolution service.
 */
export const directClaimGrants = pgTable(
  'direct_claim_grants',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.robloxUserId),
    claimKey: text('claim_key')
      .notNull()
      .references(() => claimDefinitions.key),
    isNegative: boolean('is_negative').notNull().default(false),
    reason: text('reason').notNull(),
    /** Null for system actions (the seed migration's admin grant). */
    grantedBy: bigint('granted_by', { mode: 'number' }).references(() => users.robloxUserId),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: bigint('revoked_by', { mode: 'number' }).references(() => users.robloxUserId),
    revokeReason: text('revoke_reason'),
  },
  (table) => [
    index('direct_claim_grants_user_id_idx').on(table.userId),
    // One active grant per (user, claim, polarity); history rows keep revoked_at set.
    uniqueIndex('direct_claim_grants_active_unique')
      .on(table.userId, table.claimKey, table.isNegative)
      .where(sql`${table.revokedAt} IS NULL`),
  ],
);

/**
 * Append-only record of every mutation (see DESIGN.md — Auditing). A trigger
 * in the migration rejects UPDATE/DELETE/TRUNCATE at the database level, so
 * even the application role cannot rewrite history. `actor_user_id` is null
 * for system actions (jobs, migrations); names are never stored here — they
 * hydrate from the `users` snapshot at read time via loadUserRefs.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    actorUserId: bigint('actor_user_id', { mode: 'number' }).references(() => users.robloxUserId),
    /** Key from the shared AUDIT_ACTIONS registry, e.g. `claims.grant.create`. */
    actionKey: text('action_key').notNull(),
    entityType: text('entity_type').notNull(),
    /** Stringified — entity keys vary (integer ids, UUIDs). */
    entityId: text('entity_id').notNull(),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    /** Actor-supplied justification where the action demands one (quarantine, restore). */
    reason: text('reason'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    requestIp: text('request_ip'),
  },
  (table) => [
    index('audit_events_actor_user_id_idx').on(table.actorUserId),
    index('audit_events_entity_idx').on(table.entityType, table.entityId),
    index('audit_events_action_key_idx').on(table.actionKey),
    index('audit_events_occurred_at_idx').on(table.occurredAt),
  ],
);

/**
 * Every stored PDF (see DESIGN.md — PDF Storage & Safety). The uuid id is
 * also the object key in the bucket — random, never user-derived. The
 * user-supplied filename is display metadata only, sanitized before it ever
 * appears in a header. Quarantine (`quarantined_at`) makes the file origin
 * answer 410 platform-wide without touching referencing records.
 */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uploaderUserId: bigint('uploader_user_id', { mode: 'number' })
      .notNull()
      .references(() => users.robloxUserId),
    byteSize: integer('byte_size').notNull(),
    sha256: text('sha256').notNull(),
    mime: text('mime').notNull(),
    displayFilename: text('display_filename').notNull(),
    quarantinedAt: timestamp('quarantined_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('documents_uploader_user_id_idx').on(table.uploaderUserId),
    index('documents_created_at_idx').on(table.createdAt),
  ],
);

/** A user's group roles as returned by the ROBLOX Groups API. */
export interface CachedGroupRole {
  groupId: number;
  groupName: string;
  rank: number;
  roleName: string;
}

/**
 * 15-minute-TTL cache of ROBLOX group roles per user (see DESIGN.md — Claims
 * & Permissions → Resolution & freshness). Swept hourly.
 */
export const userGroupCache = pgTable(
  'user_group_cache',
  {
    userId: bigint('user_id', { mode: 'number' })
      .primaryKey()
      .references(() => users.robloxUserId),
    groups: jsonb('groups').$type<CachedGroupRole[]>().notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('user_group_cache_fetched_at_idx').on(table.fetchedAt)],
);

// --- Bills (see DESIGN.md — Bills) -----------------------------------------

// Enum values come from the shared registries — the single source of truth —
// so a vocabulary change is a shared-package change plus a generated migration.
export const chamberEnum = pgEnum('chamber', ALL_CHAMBERS as [Chamber, ...Chamber[]]);
export const billChamberEnum = pgEnum('bill_chamber', ['H', 'S']);
export const billStatusEnum = pgEnum(
  'bill_status',
  ALL_BILL_STATUSES as [BillStatus, ...BillStatus[]],
);
export const billStageEnum = pgEnum('bill_stage', ALL_BILL_STAGES as [BillStage, ...BillStage[]]);
export const votePositionEnum = pgEnum(
  'vote_position',
  ALL_VOTE_POSITIONS as [VotePosition, ...VotePosition[]],
);

/**
 * Chamber membership snapshots synced daily from the Congress group (see
 * DESIGN.md — Bills). Members need not be platform users (no FK): rosters
 * exist so votes can be attributed to any member of Congress. Departures are
 * marked inactive, never deleted, so historical votes keep their context.
 */
export const congressRosters = pgTable(
  'congress_rosters',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    chamber: chamberEnum('chamber').notNull(),
    robloxUserId: bigint('roblox_user_id', { mode: 'number' }).notNull(),
    /** Cached from the group sync; refreshed every run. */
    usernameSnapshot: text('username_snapshot'),
    rank: integer('rank').notNull(),
    active: boolean('active').notNull().default(true),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastConfirmedAt: timestamp('last_confirmed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('congress_rosters_chamber_member_unique').on(table.chamber, table.robloxUserId),
    index('congress_rosters_chamber_active_idx').on(table.chamber, table.active),
  ],
);

/**
 * Admin-configurable mapping of Congress-group ranks to chambers, mirroring
 * the group-claim-mapping shape: a member belongs to a chamber when any of
 * its rules match their rank. With no rules a sync classifies nobody.
 */
export const rosterRankRules = pgTable('roster_rank_rules', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  chamber: chamberEnum('chamber').notNull(),
  comparison: rankComparison('comparison').notNull(),
  rankValue: integer('rank_value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The identity is `(chamber, session, sequence)` — the display id (HB8401)
 * is derived, never stored. Sequence is assigned transactionally from
 * `bill_sequence_counters`, so the unique index can only ever be a backstop.
 */
export const bills = pgTable(
  'bills',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    chamber: billChamberEnum('chamber').$type<ChamberCode>().notNull(),
    session: integer('session').notNull(),
    /** 1–99; a session never produces more than 99 bills per chamber. */
    sequence: integer('sequence').notNull(),
    title: text('title').notNull(),
    status: billStatusEnum('status').notNull().default('IN_COMMITTEE'),
    submittedBy: bigint('submitted_by', { mode: 'number' })
      .notNull()
      .references(() => users.robloxUserId),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('bills_chamber_session_sequence_unique').on(
      table.chamber,
      table.session,
      table.sequence,
    ),
    index('bills_status_idx').on(table.status),
    index('bills_session_idx').on(table.session),
    index('bills_submitted_by_idx').on(table.submittedBy),
  ],
);

/**
 * Per-(chamber, session) sequence source: an upsert increments and returns
 * the next value under the counter row's lock, serializing concurrent
 * submissions without table locks.
 */
export const billSequenceCounters = pgTable(
  'bill_sequence_counters',
  {
    chamber: billChamberEnum('chamber').$type<ChamberCode>().notNull(),
    session: integer('session').notNull(),
    lastSequence: integer('last_sequence').notNull(),
  },
  (table) => [primaryKey({ columns: [table.chamber, table.session] })],
);

/** Every PDF revision is a new row; nothing is overwritten (DESIGN.md — Bills). */
export const billVersions = pgTable(
  'bill_versions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    billId: integer('bill_id')
      .notNull()
      .references(() => bills.id),
    versionNo: integer('version_no').notNull(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    uploadedBy: bigint('uploaded_by', { mode: 'number' })
      .notNull()
      .references(() => users.robloxUserId),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('bill_versions_bill_version_unique').on(table.billId, table.versionNo)],
);

/**
 * Append-only stage pipeline history: one row per transition, `outcome` being
 * the status the transition produced. `decided_by` is null when the system
 * decided (session rollover).
 */
export const billStageEvents = pgTable(
  'bill_stage_events',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    billId: integer('bill_id')
      .notNull()
      .references(() => bills.id),
    stage: billStageEnum('stage').notNull(),
    outcome: billStatusEnum('outcome').notNull(),
    decidedBy: bigint('decided_by', { mode: 'number' }).references(() => users.robloxUserId),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
  },
  (table) => [index('bill_stage_events_bill_id_idx').on(table.billId)],
);

/**
 * Per-member votes on a stage event. Corrections never mutate: a new row is
 * inserted and the old one points at it via `superseded_by`, so tallies stay
 * auditable end to end. Live tallies count only non-superseded rows. Members
 * are attributed by ROBLOX id without a users FK — they need not be platform
 * users. Write paths serialize on the stage-event row lock.
 */
export const billVotes = pgTable(
  'bill_votes',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    stageEventId: integer('stage_event_id')
      .notNull()
      .references(() => billStageEvents.id),
    robloxUserId: bigint('roblox_user_id', { mode: 'number' }).notNull(),
    position: votePositionEnum('position').notNull(),
    recordedBy: bigint('recorded_by', { mode: 'number' })
      .notNull()
      .references(() => users.robloxUserId),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    supersededBy: bigint('superseded_by', { mode: 'number' }).references(
      (): AnyPgColumn => billVotes.id,
    ),
  },
  (table) => [
    index('bill_votes_stage_event_id_idx').on(table.stageEventId),
    index('bill_votes_live_idx')
      .on(table.stageEventId, table.robloxUserId)
      .where(sql`${table.supersededBy} IS NULL`),
  ],
);

/** Tag vocabulary — managed by `tags:manage`, applied by `bill:submit`. */
export const tags = pgTable('tags', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const billTags = pgTable(
  'bill_tags',
  {
    billId: integer('bill_id')
      .notNull()
      .references(() => bills.id),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  (table) => [primaryKey({ columns: [table.billId, table.tagId] })],
);

// --- Businesses (see DESIGN.md — Business) ----------------------------------

/**
 * Business registry per DESIGN.md — Business. The table landed in phase 05 so
 * ruling parties could reference real business rows; phase 06 adds ownership
 * transfers, licenses, and the registration endpoints/UI on top of it.
 */
export const businesses = pgTable(
  'businesses',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    name: text('name').notNull(),
    status: text('status').$type<BusinessStatus>().notNull().default('active'),
    /** Exactly one owner (see DESIGN.md — Business). */
    ownerUserId: bigint('owner_user_id', { mode: 'number' })
      .notNull()
      .references(() => users.robloxUserId),
    /** The `business:register` holder who created the entry. */
    createdBy: bigint('created_by', { mode: 'number' })
      .notNull()
      .references(() => users.robloxUserId),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('businesses_name_idx').on(table.name),
    index('businesses_owner_user_id_idx').on(table.ownerUserId),
  ],
);

/**
 * Append-only ownership transfer log (see DESIGN.md — Business): one row per
 * transfer, written in the same transaction that reassigns `owner_user_id`.
 * Never updated or deleted, so the chain of custody is always reconstructible.
 */
export const businessOwnershipTransfers = pgTable(
  'business_ownership_transfers',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    businessId: integer('business_id')
      .notNull()
      .references(() => businesses.id),
    fromUserId: bigint('from_user_id', { mode: 'number' })
      .notNull()
      .references(() => users.robloxUserId),
    toUserId: bigint('to_user_id', { mode: 'number' })
      .notNull()
      .references(() => users.robloxUserId),
    /** The owner themselves, or an admin acting for recovery. */
    initiatedBy: bigint('initiated_by', { mode: 'number' })
      .notNull()
      .references(() => users.robloxUserId),
    reason: text('reason'),
    transferredAt: timestamp('transferred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('business_ownership_transfers_business_id_idx').on(table.businessId)],
);

/** License-type vocabulary — managed by `tags:manage`, granted by `business:license-grant`. */
export const businessLicenseTypes = pgTable('business_license_types', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const licenseStatusEnum = pgEnum(
  'license_status',
  ALL_LICENSE_STATUSES as [LicenseStatus, ...LicenseStatus[]],
);

/**
 * Licenses granted to a business (`business:license-grant`). `expired` is
 * never stored — an active license past its `expires_at` derives it at read
 * time (shared effectiveLicenseStatus), so history stays exact with no sweep
 * job. Revocation is a soft update preserving who/when/why.
 */
export const businessLicenses = pgTable(
  'business_licenses',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    businessId: integer('business_id')
      .notNull()
      .references(() => businesses.id),
    licenseTypeId: integer('license_type_id')
      .notNull()
      .references(() => businessLicenseTypes.id),
    status: licenseStatusEnum('status').notNull().default('active'),
    grantedBy: bigint('granted_by', { mode: 'number' })
      .notNull()
      .references(() => users.robloxUserId),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null licenses never expire. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: bigint('revoked_by', { mode: 'number' }).references(() => users.robloxUserId),
    revokeReason: text('revoke_reason'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('business_licenses_business_id_idx').on(table.businessId),
    index('business_licenses_status_idx').on(table.status),
  ],
);

// --- Judicial (see DESIGN.md — Judicial) ------------------------------------

export const rulingStatusEnum = pgEnum(
  'ruling_status',
  ALL_RULING_STATUSES as [RulingStatus, ...RulingStatus[]],
);
export const rulingPartySideEnum = pgEnum(
  'ruling_party_side',
  ALL_RULING_PARTY_SIDES as [RulingPartySide, ...RulingPartySide[]],
);
export const rulingPartyTypeEnum = pgEnum(
  'ruling_party_type',
  ALL_RULING_PARTY_TYPES as [RulingPartyType, ...RulingPartyType[]],
);

/**
 * Final judgments entered by judges. Expungement and pardon are status
 * changes only — the row, its parties, and its audit trail persist; public
 * queries simply exclude non-active statuses (see the visibility rules in
 * packages/shared/src/courts.ts).
 */
export const rulings = pgTable(
  'rulings',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    /** Calendar date of the ruling, as entered by the judge. */
    rulingDate: date('ruling_date').notNull(),
    status: rulingStatusEnum('status').notNull().default('active'),
    enteredBy: bigint('entered_by', { mode: 'number' })
      .notNull()
      .references(() => users.robloxUserId),
    /** Judgment PDF via the shared documents pipeline. */
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('rulings_status_idx').on(table.status),
    index('rulings_ruling_date_idx').on(table.rulingDate),
    index('rulings_entered_by_idx').on(table.enteredBy),
  ],
);

/**
 * Parties on each side of a ruling. The reference column matches the party
 * type (database CHECK): user parties point at a users row (stubs are created
 * on demand for people who never logged in), business parties at a
 * businesses row, and the single fixed government entity carries no
 * reference at all.
 */
export const rulingParties = pgTable(
  'ruling_parties',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    rulingId: integer('ruling_id')
      .notNull()
      .references(() => rulings.id),
    side: rulingPartySideEnum('side').notNull(),
    partyType: rulingPartyTypeEnum('party_type').notNull(),
    robloxUserId: bigint('roblox_user_id', { mode: 'number' }).references(() => users.robloxUserId),
    businessId: integer('business_id').references(() => businesses.id),
  },
  (table) => [
    index('ruling_parties_ruling_id_idx').on(table.rulingId),
    index('ruling_parties_roblox_user_id_idx').on(table.robloxUserId),
    index('ruling_parties_business_id_idx').on(table.businessId),
    check(
      'ruling_parties_ref_matches_type',
      sql`(${table.partyType} = 'user' AND ${table.robloxUserId} IS NOT NULL AND ${table.businessId} IS NULL)
        OR (${table.partyType} = 'business' AND ${table.businessId} IS NOT NULL AND ${table.robloxUserId} IS NULL)
        OR (${table.partyType} = 'government' AND ${table.robloxUserId} IS NULL AND ${table.businessId} IS NULL)`,
    ),
  ],
);

/** Outcome vocabulary (`guilty`, `not guilty`, …) — managed like tags. */
export const rulingOutcomes = pgTable('ruling_outcomes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rulingOutcomeLinks = pgTable(
  'ruling_outcome_links',
  {
    rulingId: integer('ruling_id')
      .notNull()
      .references(() => rulings.id),
    outcomeId: integer('outcome_id')
      .notNull()
      .references(() => rulingOutcomes.id),
  },
  (table) => [primaryKey({ columns: [table.rulingId, table.outcomeId] })],
);

/**
 * Supreme Court appeal verdicts — at most one per ruling (unique index).
 * The appeal never replaces the original: both render side by side.
 */
export const appeals = pgTable(
  'appeals',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    rulingId: integer('ruling_id')
      .notNull()
      .references(() => rulings.id),
    /** Verdict PDF via the shared documents pipeline. */
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    enteredBy: bigint('entered_by', { mode: 'number' })
      .notNull()
      .references(() => users.robloxUserId),
    enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('appeals_ruling_id_unique').on(table.rulingId)],
);

export const appealOutcomeLinks = pgTable(
  'appeal_outcome_links',
  {
    appealId: integer('appeal_id')
      .notNull()
      .references(() => appeals.id),
    outcomeId: integer('outcome_id')
      .notNull()
      .references(() => rulingOutcomes.id),
  },
  (table) => [primaryKey({ columns: [table.appealId, table.outcomeId] })],
);
