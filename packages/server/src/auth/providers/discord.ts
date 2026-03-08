/**
 * Discord OAuth provider factory.
 * Uses PKCE. Untrusted email (always creates new accounts unless manually linked).
 */

import type { OAuthProvider, OAuthProviderConfig, OAuthTokens, OAuthUserInfo } from '../types';

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

      const data = (await response.json()) as {
        id: string;
        username: string;
        email?: string;
        verified?: boolean;
        avatar?: string;
        global_name?: string;
      };

      return {
        providerId: data.id,
        email: data.email ?? '',
        emailVerified: data.verified ?? false,
        name: data.global_name ?? data.username,
        avatarUrl: data.avatar
          ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
          : undefined,
      };
    },
  };
}
