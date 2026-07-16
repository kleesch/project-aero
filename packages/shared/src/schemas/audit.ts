import { z } from 'zod';

import { ALL_AUDIT_ACTION_KEYS, type AuditActionKey } from '../audit.js';

/** Payload schemas for the audit API (phase 03). */

export const auditActionKeySchema = z.enum(ALL_AUDIT_ACTION_KEYS as [AuditActionKey, ...AuditActionKey[]]);

/** Query-string filters for GET /api/audit; everything optional. */
export const auditQuerySchema = z.object({
  /** ROBLOX user id of the actor; `system` selects null-actor events. */
  actor: z
    .union([z.literal('system'), z.coerce.number().int().positive()])
    .optional(),
  entityType: z.string().min(1).max(100).optional(),
  entityId: z.string().min(1).max(100).optional(),
  action: auditActionKeySchema.optional(),
  /** ISO timestamps bounding occurred_at (inclusive from, exclusive to). */
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditRestoreSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});
export type AuditRestore = z.infer<typeof auditRestoreSchema>;
