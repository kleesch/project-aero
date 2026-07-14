import { z } from 'zod';

import { ALL_CLAIM_KEYS, type ClaimKey } from '../claims.js';

/** Payload schemas for the claim management API (phase 02). */

export const claimKeySchema = z.enum(ALL_CLAIM_KEYS as [ClaimKey, ...ClaimKey[]]);

export const rankComparisonSchema = z.enum(['>=', '==', '<=']);
export type RankComparison = z.infer<typeof rankComparisonSchema>;

/** ROBLOX group ranks run 1–255; 0 means "not a member" and is not mappable. */
export const groupClaimMappingCreateSchema = z.object({
  groupId: z.number().int().positive(),
  comparison: rankComparisonSchema,
  rankValue: z.number().int().min(1).max(255),
});
export type GroupClaimMappingCreate = z.infer<typeof groupClaimMappingCreateSchema>;

export const directClaimGrantCreateSchema = z.object({
  /** ROBLOX user id of the grantee. */
  userId: z.number().int().positive(),
  claimKey: claimKeySchema,
  isNegative: z.boolean().default(false),
  reason: z.string().trim().min(1).max(1000),
});
export type DirectClaimGrantCreate = z.infer<typeof directClaimGrantCreateSchema>;

export const directClaimGrantRevokeSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});
export type DirectClaimGrantRevoke = z.infer<typeof directClaimGrantRevokeSchema>;
