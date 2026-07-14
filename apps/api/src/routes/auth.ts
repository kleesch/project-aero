import { Router, type Response } from 'express';
import { z } from 'zod';

import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  oauthStateCookieOptions,
  sessionCookieOptions,
} from '../auth/cookies.js';
import {
  buildAuthorizationRequest,
  exchangeCodeForIdentity,
  isOAuthConfigured,
} from '../auth/roblox-oauth.js';
import { createSession, destroySession } from '../auth/sessions.js';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { logger } from '../logger.js';

export const authRouter = Router();

authRouter.get('/auth/login', (_req, res) => {
  if (!isOAuthConfigured()) {
    res.status(503).json({
      error:
        'ROBLOX OAuth is not configured. Set ROBLOX_CLIENT_ID and ROBLOX_CLIENT_SECRET (see README — ROBLOX app registration).',
    });
    return;
  }

  const { url, state, codeVerifier } = buildAuthorizationRequest();
  res.cookie(
    OAUTH_STATE_COOKIE,
    JSON.stringify({ state, codeVerifier }),
    oauthStateCookieOptions(),
  );
  res.redirect(url);
});

const stateCookieSchema = z.object({ state: z.string().min(1), codeVerifier: z.string().min(1) });

/** Lands the user back in the SPA with a diagnostic the frontend can surface. */
function failLogin(res: Response, reason: string) {
  const url = new URL('/', config.APP_BASE_URL);
  url.searchParams.set('auth_error', reason);
  res.redirect(url.toString());
}

authRouter.get('/auth/callback', async (req, res) => {
  try {
    const rawStateCookie: unknown = req.signedCookies[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, oauthStateCookieOptions());

    let stateCookie: z.infer<typeof stateCookieSchema>;
    try {
      stateCookie = stateCookieSchema.parse(JSON.parse(String(rawStateCookie)));
    } catch {
      failLogin(res, 'state_cookie_missing');
      return;
    }

    const { code, state } = req.query;
    if (typeof code !== 'string' || typeof state !== 'string' || state !== stateCookie.state) {
      failLogin(res, 'state_mismatch');
      return;
    }

    const identity = await exchangeCodeForIdentity(code, stateCookie.codeVerifier);

    // Roblox id is the primary identity; username/display name/avatar are
    // cached snapshots refreshed at every login.
    const now = new Date();
    await db
      .insert(users)
      .values({
        robloxUserId: identity.robloxUserId,
        username: identity.username,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        lastLoginAt: now,
      })
      .onConflictDoUpdate({
        target: users.robloxUserId,
        set: {
          username: identity.username,
          displayName: identity.displayName,
          avatarUrl: identity.avatarUrl,
          lastLoginAt: now,
          updatedAt: now,
        },
      });

    const { token } = await createSession(identity.robloxUserId);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    res.redirect(config.APP_BASE_URL);
  } catch (error) {
    logger.error({ error }, 'OAuth callback failed');
    // Deliberately swallow details: token-exchange errors can carry secrets.
    failLogin(res, 'exchange_failed');
  }
});

authRouter.post('/auth/logout', async (req, res, next) => {
  try {
    const token: unknown = req.signedCookies[SESSION_COOKIE];
    if (typeof token === 'string' && token !== '') {
      await destroySession(token);
    }
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
