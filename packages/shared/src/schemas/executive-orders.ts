import { z } from 'zod';

import { ALL_EFFECTIVE_EO_STATUSES, ALL_EO_STATUSES, type EoStatus } from '../executive-orders.js';

/** Payload schemas for the Executive Order APIs (phase 10). */

const eoTitleSchema = z.string().trim().min(2).max(300);
const eoSummarySchema = z.string().trim().max(5000);

/**
 * Issue an order (`eo:manage`). At most one of `repealsEoId` / `supersedesEoId`
 * may be set — an order cannot both repeal and supersede in a single act. The
 * number is entered (form suggests `max + 1`); collisions are a 409, not a
 * validation error.
 */
export const executiveOrderIssueSchema = z
  .object({
    eoNumber: z.number().int().positive(),
    title: eoTitleSchema,
    issuedByRobloxUserId: z.number().int().positive(),
    effectiveDate: z.iso.date(),
    expiresAt: z.iso.datetime().optional(),
    documentId: z.uuid(),
    summary: eoSummarySchema.optional(),
    repealsEoId: z.number().int().positive().optional(),
    supersedesEoId: z.number().int().positive().optional(),
  })
  .refine((data) => !(data.repealsEoId !== undefined && data.supersedesEoId !== undefined), {
    message: 'An order cannot both repeal and supersede another in one act.',
    path: ['supersedesEoId'],
  });
export type ExecutiveOrderIssue = z.infer<typeof executiveOrderIssueSchema>;

/** Owner-agnostic detail edits (`eo:manage`): title, summary, dates. */
export const executiveOrderUpdateSchema = z.object({
  title: eoTitleSchema,
  summary: eoSummarySchema.nullable(),
  effectiveDate: z.iso.date(),
  expiresAt: z.iso.datetime().nullable(),
});
export type ExecutiveOrderUpdate = z.infer<typeof executiveOrderUpdateSchema>;

/** Manual status correction (`eo:manage`) — reason required for the audit trail. */
export const executiveOrderStatusSchema = z.object({
  status: z.enum(ALL_EO_STATUSES as [EoStatus, ...EoStatus[]]),
  reason: z.string().trim().min(3).max(2000),
});
export type ExecutiveOrderStatusChange = z.infer<typeof executiveOrderStatusSchema>;

/** Directory query params; strings because they arrive via the URL. */
export const executiveOrderListQuerySchema = z.object({
  /** Effective status, including derived `expired`. */
  status: z.enum(ALL_EFFECTIVE_EO_STATUSES as [string, ...string[]]).optional(),
  /** ROBLOX id of the issuing president. */
  issuedBy: z.coerce.number().int().positive().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Title or number substring search. */
  q: z.string().trim().min(1).max(300).optional(),
  /** Editor filter: orders still missing a written summary. */
  missingSummary: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ExecutiveOrderListQuery = z.infer<typeof executiveOrderListQuerySchema>;
