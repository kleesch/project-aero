import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  CHAMBERS,
  CONGRESS_GROUP_ID,
  type Chamber,
  type RosterChamberSyncSummary,
  type RosterSyncSummary,
} from '@aero/shared';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db/client.js';
import { congressRosters, rosterRankRules } from '../db/schema.js';
import { fetchAllGroupMembers, type GroupMember } from '../roblox/group-members.js';
import { audit } from './audit.js';

/**
 * Congressional roster sync (see DESIGN.md — Bills): pulls the Congress
 * group's membership, classifies members into chambers via the admin-managed
 * rank rules, upserts the rosters, and marks departures inactive. Runs daily
 * and on demand (`roster:resync`).
 */

interface RankRule {
  chamber: Chamber;
  comparison: '>=' | '==' | '<=';
  rankValue: number;
}

function ruleMatches(rule: RankRule, rank: number): boolean {
  switch (rule.comparison) {
    case '>=':
      return rank >= rule.rankValue;
    case '==':
      return rank === rule.rankValue;
    case '<=':
      return rank <= rule.rankValue;
  }
}

/** Chambers a member's rank places them in; rules per chamber are OR'd. */
export function chambersForRank(rank: number, rules: readonly RankRule[]): Chamber[] {
  const matched = new Set<Chamber>();
  for (const rule of rules) {
    if (ruleMatches(rule, rank)) matched.add(rule.chamber);
  }
  return [...matched];
}

/** Injectable for tests; production uses the ROBLOX Groups API. */
export interface RosterSyncDeps {
  fetchMembers: (groupId: number) => Promise<GroupMember[]>;
}

const defaultDeps: RosterSyncDeps = { fetchMembers: fetchAllGroupMembers };

/**
 * Runs one full sync inside a transaction and writes the audit summary with
 * the given actor (null for the daily job). Members no longer in the group —
 * or no longer matching a chamber's rules — go inactive; rows are never
 * deleted, so historical votes keep their attribution.
 */
export async function syncRosters(
  actorUserId: number | null,
  deps: RosterSyncDeps = defaultDeps,
): Promise<RosterSyncSummary> {
  const members = await deps.fetchMembers(CONGRESS_GROUP_ID);
  const rules = await db.select().from(rosterRankRules);

  const summary: RosterSyncSummary = {
    groupId: CONGRESS_GROUP_ID,
    fetchedMembers: members.length,
    house: { added: 0, updated: 0, deactivated: 0, active: 0 },
    senate: { added: 0, updated: 0, deactivated: 0, active: 0 },
    syncedAt: new Date().toISOString(),
  };

  await db.transaction(async (tx) => {
    for (const chamber of [CHAMBERS.HOUSE, CHAMBERS.SENATE]) {
      const desired = new Map<number, GroupMember>();
      for (const member of members) {
        if (chambersForRank(member.rank, rules).includes(chamber)) {
          desired.set(member.robloxUserId, member);
        }
      }

      const existing = await tx
        .select()
        .from(congressRosters)
        .where(eq(congressRosters.chamber, chamber));
      const existingById = new Map(existing.map((row) => [row.robloxUserId, row]));
      const now = new Date();
      const counts: RosterChamberSyncSummary = summary[chamber];

      for (const [robloxUserId, member] of desired) {
        const row = existingById.get(robloxUserId);
        if (!row) {
          await tx.insert(congressRosters).values({
            chamber,
            robloxUserId,
            usernameSnapshot: member.username,
            rank: member.rank,
          });
          counts.added += 1;
        } else {
          await tx
            .update(congressRosters)
            .set({
              usernameSnapshot: member.username,
              rank: member.rank,
              active: true,
              lastConfirmedAt: now,
              updatedAt: now,
            })
            .where(eq(congressRosters.id, row.id));
          counts.updated += 1;
        }
      }

      const departedIds = existing
        .filter((row) => row.active && !desired.has(row.robloxUserId))
        .map((row) => row.id);
      if (departedIds.length > 0) {
        await tx
          .update(congressRosters)
          .set({ active: false, updatedAt: now })
          .where(
            and(eq(congressRosters.chamber, chamber), inArray(congressRosters.id, departedIds)),
          );
      }
      counts.deactivated = departedIds.length;
      counts.active = desired.size;
    }

    await audit(tx, {
      actorUserId,
      actionKey: AUDIT_ACTIONS.ROSTER_SYNC,
      entityType: AUDIT_ENTITIES.CONGRESS_ROSTER,
      entityId: CONGRESS_GROUP_ID,
      after: { ...summary },
      requestIp: null,
    });
  });

  return summary;
}
