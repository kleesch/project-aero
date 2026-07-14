import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, lt } from 'drizzle-orm';

import { db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { SESSION_TTL_MS } from './cookies.js';

/**
 * Server-side sessions (see DESIGN.md — Authentication & Sessions). The
 * browser holds a high-entropy token; the database stores only its SHA-256
 * hash, so leaked rows cannot be replayed as live sessions.
 */

/** Sliding expiry: extend at most once per hour to avoid a write per request. */
const SLIDING_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export type SessionUser = typeof users.$inferSelect;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: number): Promise<{ token: string }> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return { token };
}

/**
 * Resolves a session token to its user, applying sliding expiry. Expired
 * sessions are treated as absent (the hourly job purges the rows).
 */
export async function findSessionUser(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token);
  const now = new Date();

  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.robloxUserId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)));
  if (!row) return null;

  if (now.getTime() - row.session.lastSeenAt.getTime() > SLIDING_REFRESH_INTERVAL_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
      .where(eq(sessions.tokenHash, tokenHash));
  }

  return row.user;
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** Hourly cleanup job body. Returns the number of purged sessions. */
export async function deleteExpiredSessions(): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ tokenHash: sessions.tokenHash });
  return deleted.length;
}
