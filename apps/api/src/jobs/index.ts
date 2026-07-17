import { CONGRESS_TIME_ZONE } from '@aero/shared';
import cron from 'node-cron';

import { deleteExpiredSessions } from '../auth/sessions.js';
import { pool } from '../db/client.js';
import { logger } from '../logger.js';
import { sweepGroupCache } from '../roblox/group-cache.js';
import { rolloverExpiredBills } from '../services/session-rollover.js';
import { syncRosters } from '../services/roster-sync.js';

/**
 * In-process background jobs (see DESIGN.md — Background Jobs). Each job runs
 * under a Postgres advisory lock so a future multi-instance deployment never
 * double-runs one.
 */

/** Stable advisory-lock ids, one per job. Arbitrary but must never collide. */
const LOCKS = {
  sessionCleanup: 202601,
  groupCacheSweep: 202602,
  rosterRefresh: 202603,
  sessionRollover: 202604,
} as const;

async function withAdvisoryLock(lockId: number, name: string, fn: () => Promise<void>) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [lockId],
    );
    if (!rows[0]?.locked) {
      logger.debug({ job: name }, 'job skipped: another instance holds the lock');
      return;
    }
    try {
      await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
    }
  } catch (error) {
    logger.error({ job: name, error }, 'background job failed');
  } finally {
    client.release();
  }
}

export function startJobs(): void {
  // Hourly: purge expired auth sessions.
  cron.schedule('5 * * * *', () =>
    withAdvisoryLock(LOCKS.sessionCleanup, 'session-cleanup', async () => {
      const purged = await deleteExpiredSessions();
      logger.info({ purged }, 'session cleanup complete');
    }),
  );

  // Hourly: evict stale user_group_cache rows.
  cron.schedule('10 * * * *', () =>
    withAdvisoryLock(LOCKS.groupCacheSweep, 'group-cache-sweep', async () => {
      const evicted = await sweepGroupCache();
      logger.info({ evicted }, 'group cache sweep complete');
    }),
  );

  // Daily 02:00 ET: sync House/Senate rosters from the Congress group.
  cron.schedule(
    '0 2 * * *',
    () =>
      withAdvisoryLock(LOCKS.rosterRefresh, 'roster-refresh', async () => {
        const summary = await syncRosters(null);
        logger.info({ summary }, 'roster refresh complete');
      }),
    { timezone: CONGRESS_TIME_ZONE },
  );

  // Daily 00:05 ET, just after the month can roll over: kill still-active
  // bills from prior sessions (the lazy guard on bill mutation backs this up).
  cron.schedule(
    '5 0 * * *',
    () =>
      withAdvisoryLock(LOCKS.sessionRollover, 'session-rollover', async () => {
        const died = await rolloverExpiredBills();
        logger.info({ died }, 'session rollover sweep complete');
      }),
    { timezone: CONGRESS_TIME_ZONE },
  );

  logger.info('background jobs scheduled');
}
