import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { config } from '../config.js';
import * as schema from './schema.js';

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

export const db = drizzle(pool, { schema });

/** The transaction handle drizzle passes to `db.transaction` callbacks. */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Cheap connectivity probe used by the health endpoint. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
