import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  CLAIM_KEYS,
  directClaimGrantCreateSchema,
  directClaimGrantRevokeSchema,
  groupClaimMappingCreateSchema,
  isClaimKey,
  type AdminClaimView,
  type ClaimGrantView,
  type ClaimSourceView,
  type DirectGrantSourceView,
  type UserClaimsLookupView,
} from '@aero/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { Router } from 'express';

import {
  resolveUserClaims,
  type ClaimSource,
  type DirectGrantSource,
  type GrantRow,
} from '../claims/resolution.js';
import { db } from '../db/client.js';
import { claimDefinitions, directClaimGrants, groupClaimMappings, users } from '../db/schema.js';
import { requireClaim } from '../middleware/claims.js';
import { findRobloxUserById, findRobloxUserByUsername, type RobloxUser } from '../roblox/users.js';
import { audit, auditContext, toSnapshot } from '../services/audit.js';
import { loadUserRefs, type UserRefLookup } from '../services/user-refs.js';
import { isUniqueViolation, parseBody, parseIdParam } from './helpers.js';

/**
 * Claim management (see implementation-breakdown/02 — Claim management API).
 * Everything here is gated by `claims:manage`; `admin` implies it.
 */
export const adminClaimsRouter = Router();

adminClaimsRouter.use(requireClaim(CLAIM_KEYS.CLAIMS_MANAGE));

/**
 * Makes sure a users row exists for a ROBLOX identity so grants and the
 * group cache have their foreign key. Never overwrites login snapshots.
 */
async function ensureUserRow(identity: RobloxUser): Promise<void> {
  await db
    .insert(users)
    .values({
      robloxUserId: identity.robloxUserId,
      username: identity.username,
      displayName: identity.displayName,
    })
    .onConflictDoNothing();
}

/** Serializes a grant row for the wire, hydrating its ids into UserRefs. */
function toGrantView(grant: GrantRow, refs: UserRefLookup): ClaimGrantView {
  return {
    id: grant.id,
    user: refs(grant.userId),
    isNegative: grant.isNegative,
    reason: grant.reason,
    grantedBy: refs(grant.grantedBy),
    grantedAt: grant.grantedAt.toISOString(),
  };
}

// --- Claims overview -------------------------------------------------------

adminClaimsRouter.get('/claims', async (_req, res, next) => {
  try {
    const [definitions, mappings, grants] = await Promise.all([
      db.select().from(claimDefinitions).orderBy(asc(claimDefinitions.key)),
      db.select().from(groupClaimMappings).orderBy(asc(groupClaimMappings.id)),
      db
        .select()
        .from(directClaimGrants)
        .where(isNull(directClaimGrants.revokedAt))
        .orderBy(asc(directClaimGrants.grantedAt)),
    ]);

    const refs = await loadUserRefs(grants.flatMap((grant) => [grant.userId, grant.grantedBy]));

    res.json(
      definitions.flatMap((definition) => {
        // Seeded from the shared registry; anything else is not a claim.
        if (!isClaimKey(definition.key)) return [];
        return {
          key: definition.key,
          description: definition.description,
          mappings: mappings
            .filter((mapping) => mapping.claimKey === definition.key)
            .map(({ id, groupId, comparison, rankValue }) => ({
              id,
              groupId,
              comparison,
              rankValue,
            })),
          grants: grants
            .filter((grant) => grant.claimKey === definition.key)
            .map((grant) => toGrantView(grant, refs)),
        };
      }) satisfies AdminClaimView[],
    );
  } catch (error) {
    next(error);
  }
});

// --- Group claim mappings --------------------------------------------------

adminClaimsRouter.post('/claims/:key/mappings', async (req, res, next) => {
  try {
    const key = req.params.key;
    if (!isClaimKey(key)) {
      res.status(404).json({ error: 'Unknown claim key.' });
      return;
    }
    const body = parseBody(groupClaimMappingCreateSchema, req, res);
    if (!body) return;

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(groupClaimMappings)
        .values({ claimKey: key, ...body })
        .returning();
      if (!row) throw new Error('Mapping insert returned no row.');
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.CLAIM_MAPPING_CREATE,
        entityType: AUDIT_ENTITIES.GROUP_CLAIM_MAPPING,
        entityId: row.id,
        after: toSnapshot(row),
      });
      return row;
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

adminClaimsRouter.put('/mappings/:id', async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id, res);
    if (id === null) return;
    const body = parseBody(groupClaimMappingCreateSchema, req, res);
    if (!body) return;

    const updated = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(groupClaimMappings)
        .where(eq(groupClaimMappings.id, id))
        .for('update');
      if (!before) return null;
      const [after] = await tx
        .update(groupClaimMappings)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(groupClaimMappings.id, id))
        .returning();
      if (!after) throw new Error('Mapping update returned no row.');
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.CLAIM_MAPPING_UPDATE,
        entityType: AUDIT_ENTITIES.GROUP_CLAIM_MAPPING,
        entityId: after.id,
        before: toSnapshot(before),
        after: toSnapshot(after),
      });
      return after;
    });
    if (!updated) {
      res.status(404).json({ error: 'Mapping not found.' });
      return;
    }
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

adminClaimsRouter.delete('/mappings/:id', async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id, res);
    if (id === null) return;
    const deleted = await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(groupClaimMappings)
        .where(eq(groupClaimMappings.id, id))
        .returning();
      if (!row) return null;
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.CLAIM_MAPPING_DELETE,
        entityType: AUDIT_ENTITIES.GROUP_CLAIM_MAPPING,
        entityId: row.id,
        before: toSnapshot(row),
      });
      return row;
    });
    if (!deleted) {
      res.status(404).json({ error: 'Mapping not found.' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// --- Direct grants ---------------------------------------------------------

adminClaimsRouter.post('/grants', async (req, res, next) => {
  try {
    const body = parseBody(directClaimGrantCreateSchema, req, res);
    if (!body) return;

    // The grantee may never have logged in; resolve them via ROBLOX so the
    // users row (and its username snapshot) exists.
    const identity = await findRobloxUserById(body.userId);
    if (!identity) {
      res.status(404).json({ error: `No ROBLOX user with id ${body.userId}.` });
      return;
    }
    await ensureUserRow(identity);

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(directClaimGrants)
        .values({
          userId: body.userId,
          claimKey: body.claimKey,
          isNegative: body.isNegative,
          reason: body.reason,
          grantedBy: req.user?.robloxUserId ?? null,
        })
        .returning();
      if (!row) throw new Error('Grant insert returned no row.');
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.CLAIM_GRANT_CREATE,
        entityType: AUDIT_ENTITIES.DIRECT_CLAIM_GRANT,
        entityId: row.id,
        after: toSnapshot(row),
      });
      return row;
    });
    const refs = await loadUserRefs([created.userId, created.grantedBy]);
    res.status(201).json(toGrantView(created, refs));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: 'An equivalent active grant already exists.' });
      return;
    }
    next(error);
  }
});

adminClaimsRouter.post('/grants/:id/revoke', async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id, res);
    if (id === null) return;
    const body = parseBody(directClaimGrantRevokeSchema, req, res);
    if (!body) return;

    const revoked = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(directClaimGrants)
        .where(and(eq(directClaimGrants.id, id), isNull(directClaimGrants.revokedAt)))
        .for('update');
      if (!before) return null;
      const [after] = await tx
        .update(directClaimGrants)
        .set({
          revokedAt: new Date(),
          revokedBy: req.user?.robloxUserId ?? null,
          revokeReason: body.reason,
        })
        .where(eq(directClaimGrants.id, id))
        .returning();
      if (!after) throw new Error('Grant revoke returned no row.');
      await audit(tx, {
        ...auditContext(req),
        actionKey: AUDIT_ACTIONS.CLAIM_GRANT_REVOKE,
        entityType: AUDIT_ENTITIES.DIRECT_CLAIM_GRANT,
        entityId: after.id,
        before: toSnapshot(before),
        after: toSnapshot(after),
      });
      return after;
    });
    if (!revoked) {
      res.status(404).json({ error: 'No active grant with that id.' });
      return;
    }
    const refs = await loadUserRefs([revoked.userId, revoked.grantedBy]);
    res.json(toGrantView(revoked, refs));
  } catch (error) {
    next(error);
  }
});

// --- User claim lookup -----------------------------------------------------

/**
 * "Why does user X have claim Y" — resolves a user by ROBLOX id or username
 * and returns their effective claims with full provenance.
 */
adminClaimsRouter.get('/users/:query/claims', async (req, res, next) => {
  try {
    const query = req.params.query ?? '';
    const identity = /^\d+$/.test(query)
      ? await findRobloxUserById(Number(query))
      : await findRobloxUserByUsername(query);
    if (!identity) {
      res.status(404).json({ error: `No ROBLOX user matches "${query}".` });
      return;
    }

    // The group cache row needs the users FK even for never-logged-in users.
    await ensureUserRow(identity);
    const resolution = await resolveUserClaims(identity.robloxUserId);

    // Hydrate every grantor the provenance mentions in one lookup.
    const grantSources = [
      ...resolution.resolved.flatMap((entry) => entry.sources),
      ...resolution.blocked.flatMap((entry) => [entry.blockedBy, ...entry.overriddenSources]),
    ].filter((source): source is DirectGrantSource => source.type === 'direct-grant');
    const refs = await loadUserRefs(grantSources.map((source) => source.grantedBy));

    const toDirectGrantSourceView = (source: DirectGrantSource): DirectGrantSourceView => ({
      ...source,
      grantedBy: refs(source.grantedBy),
      grantedAt: source.grantedAt.toISOString(),
    });
    const toSourceView = (source: ClaimSource): ClaimSourceView =>
      source.type === 'direct-grant' ? toDirectGrantSourceView(source) : source;

    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.robloxUserId, identity.robloxUserId));
    res.json({
      user: {
        robloxUserId: identity.robloxUserId,
        username: userRow?.username ?? identity.username,
        displayName: userRow?.displayName ?? identity.displayName,
        avatarUrl: userRow?.avatarUrl ?? null,
        lastLoginAt: userRow?.lastLoginAt?.toISOString() ?? null,
      },
      claims: resolution.claims,
      resolved: resolution.resolved.map(({ key, sources }) => ({
        key,
        sources: sources.map(toSourceView),
      })),
      blocked: resolution.blocked.map(({ key, blockedBy, overriddenSources }) => ({
        key,
        blockedBy: toDirectGrantSourceView(blockedBy),
        overriddenSources: overriddenSources.map(toSourceView),
      })),
    } satisfies UserClaimsLookupView);
  } catch (error) {
    next(error);
  }
});
