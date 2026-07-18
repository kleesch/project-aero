import { z } from 'zod';

import {
  ALL_RULING_PARTY_SIDES,
  ALL_RULING_PARTY_TYPES,
  RULING_PARTY_TYPES,
  type RulingPartySide,
  type RulingPartyType,
} from '../courts.js';

/** Payload schemas for the judicial APIs (phase 05). */

export const rulingPartySideSchema = z.enum(
  ALL_RULING_PARTY_SIDES as [RulingPartySide, ...RulingPartySide[]],
);

export const rulingPartyTypeSchema = z.enum(
  ALL_RULING_PARTY_TYPES as [RulingPartyType, ...RulingPartyType[]],
);

/**
 * One party on a ruling. A discriminated union keeps the reference honest:
 * user parties carry a ROBLOX id, business parties a business id, government
 * parties nothing (there is exactly one fixed government entity).
 */
export const rulingPartyInputSchema = z.discriminatedUnion('partyType', [
  z.object({
    partyType: z.literal(RULING_PARTY_TYPES.USER),
    side: rulingPartySideSchema,
    robloxUserId: z.number().int().positive(),
  }),
  z.object({
    partyType: z.literal(RULING_PARTY_TYPES.BUSINESS),
    side: rulingPartySideSchema,
    businessId: z.number().int().positive(),
  }),
  z.object({
    partyType: z.literal(RULING_PARTY_TYPES.GOVERNMENT),
    side: rulingPartySideSchema,
  }),
]);
export type RulingPartyInput = z.infer<typeof rulingPartyInputSchema>;

export const rulingSubmitSchema = z.object({
  /** Calendar date of the ruling (YYYY-MM-DD). */
  rulingDate: z.iso.date(),
  /** Documents-pipeline id of the judgment PDF. */
  documentId: z.uuid(),
  /** At least one outcome from the vocabulary. */
  outcomeIds: z.array(z.number().int().positive()).min(1).max(20),
  /** At least one party; both sides need not be present (e.g. in re matters). */
  parties: z.array(rulingPartyInputSchema).min(1).max(50),
});
export type RulingSubmit = z.infer<typeof rulingSubmitSchema>;

export const appealSubmitSchema = z.object({
  /** Documents-pipeline id of the Supreme Court verdict PDF. */
  documentId: z.uuid(),
  outcomeIds: z.array(z.number().int().positive()).min(1).max(20),
});
export type AppealSubmit = z.infer<typeof appealSubmitSchema>;

/** Expungement and pardon both demand a justification for the audit trail. */
export const rulingModerationSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
});
export type RulingModeration = z.infer<typeof rulingModerationSchema>;

export const outcomeCreateSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(300).optional(),
});
export type OutcomeCreate = z.infer<typeof outcomeCreateSchema>;

export const partyLookupQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
});
export type PartyLookupQuery = z.infer<typeof partyLookupQuerySchema>;

/** Ruling list query params; strings because they arrive via the URL. */
export const rulingListQuerySchema = z.object({
  partyType: rulingPartyTypeSchema.optional(),
  /** Outcome vocabulary id the ruling (or its appeal) must carry. */
  outcomeId: z.coerce.number().int().positive().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Party search: username or business-name substring. */
  party: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type RulingListQuery = z.infer<typeof rulingListQuerySchema>;
