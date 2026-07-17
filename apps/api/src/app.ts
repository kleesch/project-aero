import cookieParser from 'cookie-parser';
import express from 'express';

import { config } from './config.js';
import { requestLogger } from './middleware/request-logger.js';
import { attachSession } from './middleware/session.js';
import { adminClaimsRouter } from './routes/admin-claims.js';
import { adminDocumentsRouter } from './routes/admin-documents.js';
import { adminRostersRouter } from './routes/admin-rosters.js';
import { adminAuditRouter, auditRouter } from './routes/audit.js';
import { authRouter } from './routes/auth.js';
import { billsRouter } from './routes/bills.js';
import { documentsRouter } from './routes/documents.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';
import { rostersRouter } from './routes/rosters.js';
import { tagsRouter } from './routes/tags.js';

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
  // Each of these routers carries a router-level requireClaim gate, so every
  // one is mounted on its own exact prefix — they must never see one
  // another's requests.
  app.use('/api/audit', auditRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/admin/audit', adminAuditRouter);
  app.use('/api/admin/documents', adminDocumentsRouter);
  app.use('/api/admin/roster-rank-rules', adminRostersRouter);
  app.use('/api/admin', adminClaimsRouter);
  // Public reads with per-route claim gates on their mutations.
  app.use('/api/rosters', rostersRouter);
  app.use('/api/bills', billsRouter);
  app.use('/api/tags', tagsRouter);

  return app;
}
