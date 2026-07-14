import {
  CLAIM_KEYS,
  directClaimGrantCreateSchema,
  directClaimGrantRevokeSchema,
  groupClaimMappingCreateSchema,
  isClaimKey,
} from '@aero/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { Router, type Request, type Response } from 'express';
import { z, type ZodType } from 'zod';

import { resolveUserClaims } from '../claims/resolution.js';
import { db } from '../db/client.js';
import { claimDefinitions, directClaimGrants, groupClaimMappings, users } from '../db/schema.js';
import { requireClaim } from '../middleware/claims.js';
import { findRobloxUserById, findRobloxUserByUsername, type RobloxUser } from '../roblox/users.js';

/**
 * Claim management (see implementation-breakdown/02 — Claim management API).
 * Everything here is gated by `claims:manage`; `admin` implies it.
 */
export const adminClaimsRouter = Router();

adminClaimsRouter.use(requireClaim(CLAIM_KEYS.CLAIMS_MANAGE));

/** Parses a request body, answering 400 with the issues when it is invalid. */
function parseBody<T>(schema: ZodType<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid request body.', issues: result.error.issues });
    return null;
  }
  return result.data;
}

const idParamSchema = z.coerce.number().int().positive();

function parseIdParam(raw: string | undefined, res: Response): number | null {
  const result = idParamSchema.safeParse(raw);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid id parameter.' });
    return null;
  }
  return result.data;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

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

    // One lookup for every username the response mentions.
    const userIds = new Set<number>();
    for (const grant of grants) {
      userIds.add(grant.userId);
      if (grant.grantedBy !== null) userIds.add(grant.grantedBy);
    }
    const userRows = userIds.size
      ? await db
          .select()
          .from(users)
          .where(inArray(users.robloxUserId, [...userIds]))
      : [];
    const usernames = new Map(userRows.map((row) => [row.robloxUserId, row.username]));

    res.json(
      definitions.map((definition) => ({
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
          .map((grant) => ({
            id: grant.id,
            userId: grant.userId,
            username: usernames.get(grant.userId) ?? null,
            isNegative: grant.isNegative,
            reason: grant.reason,
            grantedBy: grant.grantedBy,
            grantedByUsername:
              grant.grantedBy === null ? null : (usernames.get(grant.grantedBy) ?? null),
            grantedAt: grant.grantedAt,
          })),
      })),
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

    const [created] = await db
      .insert(groupClaimMappings)
      .values({ claimKey: key, ...body })
      .returning();
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

    const [updated] = await db
      .update(groupClaimMappings)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(groupClaimMappings.id, id))
      .returning();
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
    const deleted = await db
      .delete(groupClaimMappings)
      .where(eq(groupClaimMappings.id, id))
      .returning();
    if (deleted.length === 0) {
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

    const [created] = await db
      .insert(directClaimGrants)
      .values({
        userId: body.userId,
        claimKey: body.claimKey,
        isNegative: body.isNegative,
        reason: body.reason,
        grantedBy: req.user?.robloxUserId ?? null,
      })
      .returning();
    res.status(201).json(created);
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

    const [revoked] = await db
      .update(directClaimGrants)
      .set({
        revokedAt: new Date(),
        revokedBy: req.user?.robloxUserId ?? null,
        revokeReason: body.reason,
      })
      .where(and(eq(directClaimGrants.id, id), isNull(directClaimGrants.revokedAt)))
      .returning();
    if (!revoked) {
      res.status(404).json({ error: 'No active grant with that id.' });
      return;
    }
    res.json(revoked);
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
        lastLoginAt: userRow?.lastLoginAt ?? null,
      },
      claims: resolution.claims,
      resolved: resolution.resolved,
      blocked: resolution.blocked,
    });
  } catch (error) {
    next(error);
  }
});
