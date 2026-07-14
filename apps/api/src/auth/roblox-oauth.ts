import { createHash, randomBytes } from 'node:crypto';

import { z } from 'zod';

import { config } from '../config.js';

/**
 * ROBLOX OAuth 2.0, Authorization Code + PKCE (see DESIGN.md —
 * Authentication & Sessions). Scopes: openid profile.
 */

const AUTHORIZE_URL = 'https://apis.roblox.com/oauth/v1/authorize';
const TOKEN_URL = 'https://apis.roblox.com/oauth/v1/token';
const USERINFO_URL = 'https://apis.roblox.com/oauth/v1/userinfo';

export function isOAuthConfigured(): boolean {
  return Boolean(config.ROBLOX_CLIENT_ID && config.ROBLOX_CLIENT_SECRET);
}

export function redirectUri(): string {
  return new URL('/auth/callback', config.APP_BASE_URL).toString();
}

export interface AuthorizationRequest {
  url: string;
  state: string;
  codeVerifier: string;
}

export function buildAuthorizationRequest(): AuthorizationRequest {
  const state = randomBytes(16).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', config.ROBLOX_CLIENT_ID ?? '');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('scope', 'openid profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return { url: url.toString(), state, codeVerifier };
}

const tokenResponseSchema = z.object({ access_token: z.string() });

const userinfoSchema = z.object({
  /** ROBLOX user id, as a string per OIDC. */
  sub: z.string().regex(/^\d+$/),
  preferred_username: z.string().optional(),
  /** Display name (ROBLOX sends it as both `name` and `nickname`). */
  name: z.string().optional(),
  picture: z.url().optional(),
});

export interface RobloxIdentity {
  robloxUserId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/** Exchanges the authorization code and fetches the user's identity. */
export async function exchangeCodeForIdentity(
  code: string,
  codeVerifier: string,
): Promise<RobloxIdentity> {
  const tokenResponse = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      client_id: config.ROBLOX_CLIENT_ID ?? '',
      client_secret: config.ROBLOX_CLIENT_SECRET ?? '',
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`ROBLOX token exchange failed with status ${tokenResponse.status}`);
  }
  const { access_token } = tokenResponseSchema.parse(await tokenResponse.json());

  const userinfoResponse = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!userinfoResponse.ok) {
    throw new Error(`ROBLOX userinfo fetch failed with status ${userinfoResponse.status}`);
  }
  const userinfo = userinfoSchema.parse(await userinfoResponse.json());

  const robloxUserId = Number(userinfo.sub);
  return {
    robloxUserId,
    username: userinfo.preferred_username ?? `user-${robloxUserId}`,
    displayName: userinfo.name ?? null,
    avatarUrl: userinfo.picture ?? null,
  };
}
