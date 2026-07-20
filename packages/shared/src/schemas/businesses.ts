import { z } from 'zod';

/** Payload schemas for the business APIs (phase 06). */

const businessNameSchema = z.string().trim().min(2).max(120);

/** Registrar creates the entry and assigns the owner (`business:register`). */
export const businessRegisterSchema = z.object({
  name: businessNameSchema,
  ownerRobloxUserId: z.number().int().positive(),
});
export type BusinessRegister = z.infer<typeof businessRegisterSchema>;

/** Owner-only detail edits (deliberately outside the claims system per spec). */
export const businessUpdateSchema = z.object({
  name: businessNameSchema,
});
export type BusinessUpdate = z.infer<typeof businessUpdateSchema>;

/** Ownership transfer, initiated by the current owner (or admin, for recovery). */
export const businessTransferSchema = z.object({
  toRobloxUserId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(2000).optional(),
});
export type BusinessTransfer = z.infer<typeof businessTransferSchema>;

export const licenseTypeCreateSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(300).optional(),
});
export type LicenseTypeCreate = z.infer<typeof licenseTypeCreateSchema>;

export const licenseGrantSchema = z.object({
  licenseTypeId: z.number().int().positive(),
  /** Instant the license lapses; omitted licenses never expire. */
  expiresAt: z.iso.datetime().optional(),
});
export type LicenseGrant = z.infer<typeof licenseGrantSchema>;

/** Update of a live license — currently only the expiry can change. */
export const licenseUpdateSchema = z.object({
  expiresAt: z.iso.datetime().nullable(),
});
export type LicenseUpdate = z.infer<typeof licenseUpdateSchema>;

/** Revocation demands a justification for the audit trail. */
export const licenseRevokeSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
});
export type LicenseRevoke = z.infer<typeof licenseRevokeSchema>;

/** Directory query params; strings because they arrive via the URL. */
export const businessListQuerySchema = z.object({
  /** Name substring search. */
  q: z.string().trim().min(1).max(120).optional(),
  /** `true` → only businesses holding an effective license; `false` → only those without. */
  licensed: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type BusinessListQuery = z.infer<typeof businessListQuerySchema>;

export const ownerLookupQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
});
export type OwnerLookupQuery = z.infer<typeof ownerLookupQuerySchema>;
