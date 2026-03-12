/**
 * Discord OAuth provider factory.
 * Uses PKCE. Untrusted email (always creates new accounts unless manually linked).
 */

import type { OAuthProvider, OAuthProviderConfig, OAuthTokens, OAuthUserInfo } from '../types';

/** Fields returned by Discord's GET /users/@me API. */
export interface DiscordProfile {
  id: string;
  username: string;
  discriminator: string;
  global_name: string | null;
  avatar: string | null;
  bot?: boolean;
  system?: boolean;
  mfa_enabled: boolean;
  banner: string | null;
  accent_color: number | null;
  locale: string;
  verified: boolean;
  email: string | null;
  flags?: number;
  premium_type?: number;
  public_flags?: number;
  [key: string]: unknown;
}

const AUTHORIZATION_URL = 'https://discord.com/api/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const USER_URL = 'https://discord.com/api/users/@me';
const DEFAULT_SCOPES = ['identify', 'email'];

export function discord(config: OAuthProviderConfig): OAuthProvider {
  const scopes = config.scopes ?? DEFAULT_SCOPES;

  return {
    id: 'discord',
    name: 'Discord',
    scopes,
    trustEmail: false,

    getAuthorizationUrl(state: string, codeChallenge?: string): string {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUrl ?? '',
        response_type: 'code',
        scope: scopes.join(' '),
        state,
      });

      if (codeChallenge) {
        params.set('code_challenge', codeChallenge);
        params.set('code_challenge_method', 'S256');
      }

      return `${AUTHORIZATION_URL}?${params.toString()}`;
    },

    async exchangeCode(code: string, codeVerifier?: string): Promise<OAuthTokens> {
      const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUrl ?? '',
      });

      if (codeVerifier) {
        body.set('code_verifier', codeVerifier);
      }

      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      };
    },

    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
      const response = await fetch(USER_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const data = (await response.json()) as Record<string, unknown>;

      return {
        providerId: data.id as string,
        email: (data.email as string | undefined) ?? '',
        emailVerified: (data.verified as boolean | undefined) ?? false,
        raw: data,
      };
    },
  };
}
