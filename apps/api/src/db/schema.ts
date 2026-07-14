import { bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
