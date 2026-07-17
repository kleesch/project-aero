import { z } from 'zod';

import {
  ALL_BILL_STATUSES,
  ALL_VOTE_POSITIONS,
  type BillStatus,
  type VotePosition,
} from '../bills.js';
import { ALL_CHAMBERS, type Chamber } from '../congress.js';

/** Payload schemas for the bill APIs (phase 04). */

export const chamberSchema = z.enum(ALL_CHAMBERS as [Chamber, ...Chamber[]]);

export const billStatusSchema = z.enum(ALL_BILL_STATUSES as [BillStatus, ...BillStatus[]]);

export const votePositionSchema = z.enum(ALL_VOTE_POSITIONS as [VotePosition, ...VotePosition[]]);

export const billSubmitSchema = z.object({
  title: z.string().trim().min(1).max(300),
  /** Documents-pipeline id of the initial PDF (becomes version 1). */
  documentId: z.uuid(),
  /**
   * Origin chamber. Normally derived from the submitter's roster membership;
   * required explicitly only when they sit on both rosters.
   */
  chamber: chamberSchema.optional(),
  tagIds: z.array(z.number().int().positive()).max(20).default([]),
});
export type BillSubmit = z.infer<typeof billSubmitSchema>;

export const billTransitionSchema = z.object({
  /** Target status; legality against the shared transition map is checked server-side. */
  toStatus: billStatusSchema,
  notes: z.string().trim().min(1).max(2000).optional(),
});
export type BillTransition = z.infer<typeof billTransitionSchema>;

export const billVersionCreateSchema = z.object({
  documentId: z.uuid(),
});
export type BillVersionCreate = z.infer<typeof billVersionCreateSchema>;

export const billVoteEntrySchema = z.object({
  robloxUserId: z.number().int().positive(),
  position: votePositionSchema,
});
export type BillVoteEntry = z.infer<typeof billVoteEntrySchema>;

export const billVotesRecordSchema = z
  .object({
    votes: z.array(billVoteEntrySchema).min(1).max(600),
    /**
     * Rosters may lag reality; recording a vote for someone missing from the
     * stage's chamber roster requires this explicit confirmation.
     */
    confirmOffRoster: z.boolean().default(false),
  })
  .refine(
    (body) => new Set(body.votes.map((vote) => vote.robloxUserId)).size === body.votes.length,
    { message: 'Each member may appear only once per vote sheet.', path: ['votes'] },
  );
export type BillVotesRecord = z.infer<typeof billVotesRecordSchema>;

export const billTagsUpdateSchema = z.object({
  /** Full replacement set for the bill's tags. */
  tagIds: z.array(z.number().int().positive()).max(20),
});
export type BillTagsUpdate = z.infer<typeof billTagsUpdateSchema>;

export const tagCreateSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(300).optional(),
});
export type TagCreate = z.infer<typeof tagCreateSchema>;

/** Bill list query params; strings because they arrive via the URL. */
export const billListQuerySchema = z.object({
  session: z.coerce.number().int().positive().optional(),
  chamber: chamberSchema.optional(),
  status: billStatusSchema.optional(),
  /** Comma-separated tag ids; a bill must carry all of them. */
  tags: z
    .string()
    .transform((raw) => raw.split(',').map((part) => Number(part.trim())))
    .pipe(z.array(z.number().int().positive()).max(20))
    .optional(),
  /** Display id (exact, e.g. HB8401) or title substring. */
  q: z.string().trim().min(1).max(300).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type BillListQuery = z.infer<typeof billListQuerySchema>;
