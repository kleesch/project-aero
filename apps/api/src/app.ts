import express from 'express';

import { requestLogger } from './middleware/request-logger.js';
import { healthRouter } from './routes/health.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(express.json());

  app.use('/api', healthRouter);

  return app;
}
