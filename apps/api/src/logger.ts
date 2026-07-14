import { pino } from 'pino';

import { config } from './config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  // Pretty-print locally; structured JSON everywhere else.
  transport:
    config.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
});
