import type { NextFunction, Request, Response } from 'express';

import { SESSION_COOKIE, sessionCookieOptions } from '../auth/cookies.js';
import { findSessionUser, type SessionUser } from '../auth/sessions.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by attachSession when a valid session cookie accompanies the request. */
    user?: SessionUser;
  }
}

/**
 * Resolves the session cookie to `req.user` on every request. Never rejects —
 * anonymous browsing is the default; enforcement lives in requireAuth /
 * requireClaim (see middleware/claims.ts).
 */
export async function attachSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token: unknown = req.signedCookies[SESSION_COOKIE];
  if (typeof token !== 'string' || token === '') {
    next();
    return;
  }

  try {
    const user = await findSessionUser(token);
    if (user) {
      req.user = user;
    } else {
      // Expired or revoked server-side; drop the stale cookie.
      res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    }
    next();
  } catch (error) {
    next(error);
  }
}
