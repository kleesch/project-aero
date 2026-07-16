import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { createFileOriginApp } from './file-origin/app.js';
import { startJobs } from './jobs/index.js';
import { logger } from './logger.js';

await runMigrations();
startJobs();

const server = createApp().listen(config.PORT, () => {
  logger.info({ port: config.PORT, environment: config.NODE_ENV }, 'API listening');
});

// The PDF proxy listens on its own port — served under a separate hostname
// in production — so browsers treat it as a different origin from the app.
const fileServer = createFileOriginApp().listen(config.FILE_ORIGIN_PORT, () => {
  logger.info({ port: config.FILE_ORIGIN_PORT }, 'file origin listening');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  let open = 2;
  const onClosed = () => {
    if (--open === 0) void pool.end().then(() => process.exit(0));
  };
  server.close(onClosed);
  fileServer.close(onClosed);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
