import type { Request, Response } from 'express';
import { z, type ZodType } from 'zod';

/** Small parsing helpers shared by the route modules. */

/** Parses a request body, answering 400 with the issues when it is invalid. */
export function parseBody<T>(schema: ZodType<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid request body.', issues: result.error.issues });
    return null;
  }
  return result.data;
}

const idParamSchema = z.coerce.number().int().positive();

/** Parses a positive-integer path parameter, answering 400 when it is not one. */
export function parseIdParam(raw: string | string[] | undefined, res: Response): number | null {
  const result = idParamSchema.safeParse(typeof raw === 'string' ? raw : undefined);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid id parameter.' });
    return null;
  }
  return result.data;
}

/**
 * True for the Postgres unique-violation error code (23505). Drizzle wraps
 * query errors (DrizzleQueryError) with the original pg error on `.cause`, so
 * we walk the cause chain rather than only checking the top-level code.
 */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current != null; current = (current as { cause?: unknown }).cause) {
    if (typeof current === 'object' && (current as { code?: string }).code === '23505') {
      return true;
    }
  }
  return false;
}
