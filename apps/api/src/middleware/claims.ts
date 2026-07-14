import type { ClaimKey } from '@aero/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { resolveUserClaims, type ClaimResolution } from '../claims/resolution.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by requireClaim after a successful resolution. */
    claims?: ClaimResolution;
  }
}

/** 401 for anonymous requests; enforcement only — attachSession identifies. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  next();
}

/**
 * 401 anonymous, 403 without the claim. Resolves claims fresh on every gated
 * request (group roles via the 15-minute cache, grants live), so negative
 * grants take effect immediately.
 */
export function requireClaim(key: ClaimKey): RequestHandler {
  return async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    try {
      const resolution = await resolveUserClaims(req.user.robloxUserId);
      if (!resolution.claims.includes(key)) {
        res.status(403).json({ error: `Missing required claim: ${key}` });
        return;
      }
      req.claims = resolution;
      next();
    } catch (error) {
      next(error);
    }
  };
}
