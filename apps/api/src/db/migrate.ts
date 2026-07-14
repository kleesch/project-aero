import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { logger } from '../logger.js';
import { db } from './client.js';

// Resolves to apps/api/drizzle whether running from src (tsx) or dist (node).
const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname;

export async function runMigrations(): Promise<void> {
  logger.info({ migrationsFolder }, 'applying database migrations');
  await migrate(db, { migrationsFolder });
  logger.info('database migrations up to date');
}
