import { Router } from 'express';

import { resolveUserClaims } from '../claims/resolution.js';

export const meRouter = Router();

/**
 * Identity + merged claim set for the frontend to gate UI affordances.
 * Display-only — every mutation is re-checked server-side by requireClaim.
 * Anonymous requests get a 200 with `user: null`; browsing is public.
 */
meRouter.get('/me', async (req, res, next) => {
  if (!req.user) {
    res.json({ user: null, claims: [] });
    return;
  }
  try {
    const resolution = await resolveUserClaims(req.user.robloxUserId);
    res.json({
      user: {
        robloxUserId: req.user.robloxUserId,
        username: req.user.username,
        displayName: req.user.displayName,
        avatarUrl: req.user.avatarUrl,
      },
      claims: resolution.claims,
    });
  } catch (error) {
    next(error);
  }
});
