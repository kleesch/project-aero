import { pinoHttp } from 'pino-http';

import { logger } from '../logger.js';

export const requestLogger = pinoHttp({
  logger,
  // Health checks are hit constantly by Docker/monitoring; keep them quiet.
  autoLogging: {
    ignore: (req) => req.url === '/api/health',
  },
});
