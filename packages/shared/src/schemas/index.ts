/**
 * Zod schemas for API payloads, shared between `apps/api` (request/response
 * validation) and `apps/web` (typed client payloads).
 *
 * Conventions:
 * - One file per domain, named after it: `auth.ts`, `bills.ts`, `courts.ts`,
 *   `businesses.ts`, … added in the phase that introduces the endpoints.
 * - Schemas are named `<entity><Action>Schema` (e.g. `billCreateSchema`) with
 *   the inferred type exported alongside (`export type BillCreate = z.infer<…>`).
 * - Enum-like fields reuse the const registries in this package (claim keys,
 *   bill statuses, vote positions) rather than redeclaring literals.
 * - Everything is re-exported from this barrel file.
 */
export * from './claims.js';
export * from './audit.js';
export * from './documents.js';
