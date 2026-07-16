import { z } from 'zod';

/** Payload schemas for the document API (phase 03). */

export const documentQuarantineSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});
export type DocumentQuarantine = z.infer<typeof documentQuarantineSchema>;
