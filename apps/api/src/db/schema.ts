import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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
