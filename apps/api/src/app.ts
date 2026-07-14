import cookieParser from 'cookie-parser';
import express from 'express';

import { config } from './config.js';
import { requestLogger } from './middleware/request-logger.js';
import { attachSession } from './middleware/session.js';
import { adminClaimsRouter } from './routes/admin-claims.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(express.json());
  app.use(cookieParser(config.SESSION_SECRET));
  app.use(attachSession);

  app.use(authRouter);
  app.use('/api', healthRouter);
  app.use('/api', meRouter);
  app.use('/api/admin', adminClaimsRouter);

  return app;
}
