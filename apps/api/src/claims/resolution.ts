import { ADMIN_IMPLIED_CLAIMS, CLAIM_KEYS, isClaimKey, type ClaimKey } from '@aero/shared';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../db/client.js';
import { directClaimGrants, groupClaimMappings, type CachedGroupRole } from '../db/schema.js';
import { getUserGroupRoles } from '../roblox/groups.js';

/**
 * Claim resolution — the security core of the platform (see DESIGN.md —
 * Claims & Permissions):
 *
 *   effective = (group-derived ∪ positive direct grants) − negative grants
 *
 * Group roles come through the 15-minute cache; direct grants — and above
 * all negative grants — are read live from Postgres on every resolution, so
 * a block takes effect on the next request.
 */

export type RankComparison = '>=' | '==' | '<=';

export interface GroupMappingSource {
  type: 'group-mapping';
  mappingId: number;
  groupId: number;
  groupName: string | null;
  comparison: RankComparison;
  rankValue: number;
  userRank: number;
}

export interface DirectGrantSource {
  type: 'direct-grant';
  grantId: number;
  isNegative: boolean;
  reason: string;
  grantedBy: number | null;
  grantedAt: Date;
}

/** The claim is held only because `admin` implies it. */
export interface AdminImpliedSource {
  type: 'admin-implied';
}

export type ClaimSource = GroupMappingSource | DirectGrantSource | AdminImpliedSource;

export interface ResolvedClaim {
  key: ClaimKey;
  sources: ClaimSource[];
}

/** A claim the user would hold, blocked by a negative grant. */
export interface BlockedClaim {
  key: ClaimKey;
  blockedBy: DirectGrantSource;
  overriddenSources: ClaimSource[];
}

export interface ClaimResolution {
  /** The effective claim set. */
  claims: ClaimKey[];
  /** Effective claims with provenance — answers "why does X have Y". */
  resolved: ResolvedClaim[];
  /** Negative-grant blocks, with what they overrode. */
  blocked: BlockedClaim[];
}

export type MappingRow = typeof groupClaimMappings.$inferSelect;
export type GrantRow = typeof directClaimGrants.$inferSelect;

/** Injectable for tests; production code uses the live defaults below. */
export interface ResolutionDeps {
  getGroupRoles: (userId: number) => Promise<CachedGroupRole[]>;
  listMappings: () => Promise<MappingRow[]>;
  /** Active (unrevoked) grants, positive and negative — always read live. */
  listActiveGrants: (userId: number) => Promise<GrantRow[]>;
}

const defaultDeps: ResolutionDeps = {
  getGroupRoles: (userId) => getUserGroupRoles(userId),
  listMappings: () => db.select().from(groupClaimMappings),
  listActiveGrants: (userId) =>
    db
      .select()
      .from(directClaimGrants)
      .where(and(eq(directClaimGrants.userId, userId), isNull(directClaimGrants.revokedAt))),
};

function satisfies(comparison: RankComparison, userRank: number, rankValue: number): boolean {
  switch (comparison) {
    case '>=':
      return userRank >= rankValue;
    case '==':
      return userRank === rankValue;
    case '<=':
      return userRank <= rankValue;
  }
}

function toGrantSource(grant: GrantRow): DirectGrantSource {
  return {
    type: 'direct-grant',
    grantId: grant.id,
    isNegative: grant.isNegative,
    reason: grant.reason,
    grantedBy: grant.grantedBy,
    grantedAt: grant.grantedAt,
  };
}

export async function resolveUserClaims(
  userId: number,
  deps: ResolutionDeps = defaultDeps,
): Promise<ClaimResolution> {
  const [groups, mappings, grants] = await Promise.all([
    deps.getGroupRoles(userId),
    deps.listMappings(),
    deps.listActiveGrants(userId),
  ]);

  const held = new Map<ClaimKey, ClaimSource[]>();
  const addSource = (key: ClaimKey, source: ClaimSource) => {
    const sources = held.get(key);
    if (sources) sources.push(source);
    else held.set(key, [source]);
  };

  // Group-derived claims. Multiple mappings per claim are OR'd. A user who is
  // not in the mapped group never satisfies the mapping — this matters for
  // '<=' comparisons, which would otherwise match every non-member.
  for (const mapping of mappings) {
    if (!isClaimKey(mapping.claimKey)) continue;
    const membership = groups.find((group) => group.groupId === mapping.groupId);
    if (!membership) continue;
    if (satisfies(mapping.comparison, membership.rank, mapping.rankValue)) {
      addSource(mapping.claimKey, {
        type: 'group-mapping',
        mappingId: mapping.id,
        groupId: mapping.groupId,
        groupName: membership.groupName,
        comparison: mapping.comparison,
        rankValue: mapping.rankValue,
        userRank: membership.rank,
      });
    }
  }

  // Positive direct grants.
  for (const grant of grants) {
    if (grant.isNegative || !isClaimKey(grant.claimKey)) continue;
    addSource(grant.claimKey, toGrantSource(grant));
  }

  // Negative grants override everything, held or not.
  const negativeByKey = new Map<ClaimKey, GrantRow>();
  for (const grant of grants) {
    if (grant.isNegative && isClaimKey(grant.claimKey)) negativeByKey.set(grant.claimKey, grant);
  }

  const blocked: BlockedClaim[] = [];
  for (const [key, grant] of negativeByKey) {
    blocked.push({
      key,
      blockedBy: toGrantSource(grant),
      overriddenSources: held.get(key) ?? [],
    });
    held.delete(key);
  }

  // `admin` implies the management claims — unless a negative grant blocks
  // the implied claim itself (negative always wins).
  if (held.has(CLAIM_KEYS.ADMIN)) {
    for (const implied of ADMIN_IMPLIED_CLAIMS) {
      if (!held.has(implied) && !negativeByKey.has(implied)) {
        held.set(implied, [{ type: 'admin-implied' }]);
      }
    }
  }

  const resolved = [...held.entries()].map(([key, sources]) => ({ key, sources }));
  return {
    claims: resolved.map((entry) => entry.key),
    resolved,
    blocked,
  };
}
