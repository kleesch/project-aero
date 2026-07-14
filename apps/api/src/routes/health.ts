import { Router } from 'express';

import { pingDatabase } from '../db/client.js';
import { config } from '../config.js';

const startedAt = new Date();

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const databaseConnected = await pingDatabase();
  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? 'ok' : 'degraded',
    version: process.env.npm_package_version ?? '0.0.0',
    commit: process.env.BUILD_COMMIT ?? 'unknown',
    environment: config.NODE_ENV,
    startedAt: startedAt.toISOString(),
    database: databaseConnected ? 'connected' : 'unreachable',
  });
});
