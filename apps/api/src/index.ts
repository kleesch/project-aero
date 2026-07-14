import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { logger } from './logger.js';

await runMigrations();

const server = createApp().listen(config.PORT, () => {
  logger.info({ port: config.PORT, environment: config.NODE_ENV }, 'API listening');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
