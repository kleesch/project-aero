import { z } from 'zod';

import { chamberSchema } from './bills.js';
import { rankComparisonSchema } from './claims.js';

/** Payload schemas for the roster APIs (phase 04). */

/**
 * Rank rule mapping Congress-group ranks to a chamber, same shape as group
 * claim mappings: a member belongs to a chamber when any of its rules'
 * comparisons match their rank.
 */
export const rosterRankRuleCreateSchema = z.object({
  chamber: chamberSchema,
  comparison: rankComparisonSchema,
  rankValue: z.number().int().min(1).max(255),
});
export type RosterRankRuleCreate = z.infer<typeof rosterRankRuleCreateSchema>;
