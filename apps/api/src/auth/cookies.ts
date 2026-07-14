import type { CookieOptions } from 'express';

import { config } from '../config.js';

export const SESSION_COOKIE = 'aero_session';
export const OAUTH_STATE_COOKIE = 'aero_oauth';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** How long the PKCE verifier/state cookie survives between login and callback. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * `secure` is env-driven (see config.ts): on in production, off for
 * plain-http local dev — Safari drops `Secure` cookies on insecure origins
 * including http://localhost.
 */
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    signed: true,
    maxAge: SESSION_TTL_MS,
    path: '/',
  };
}

export function oauthStateCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    signed: true,
    maxAge: OAUTH_STATE_TTL_MS,
    // Sent only where it is needed: the OAuth callback.
    path: '/auth/callback',
  };
}
