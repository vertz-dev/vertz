/**
 * GitHub OAuth provider factory.
 * No PKCE support. Untrusted email (always creates new accounts unless manually linked).
 */

import type { OAuthProvider, OAuthProviderConfig, OAuthTokens, OAuthUserInfo } from '../types';

const AUTHORIZATION_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const EMAILS_URL = 'https://api.github.com/user/emails';
const DEFAULT_SCOPES = ['read:user', 'user:email'];

export function github(config: OAuthProviderConfig): OAuthProvider {
  const scopes = config.scopes ?? DEFAULT_SCOPES;

  return {
    id: 'github',
    name: 'GitHub',
    scopes,
    trustEmail: false,

    getAuthorizationUrl(state: string): string {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUrl ?? '',
        scope: scopes.join(' '),
        state,
      });

      // GitHub does not support PKCE — no code_challenge param

      return `${AUTHORIZATION_URL}?${params.toString()}`;
    },

    async exchangeCode(code: string): Promise<OAuthTokens> {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.redirectUrl ?? '',
        }),
      });

      const data = (await response.json()) as {
        access_token: string;
        token_type: string;
      };

      return {
        accessToken: data.access_token,
      };
    },

    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
      const [userResponse, emailsResponse] = await Promise.all([
        fetch(USER_URL, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(EMAILS_URL, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      const userData = (await userResponse.json()) as {
        id: number;
        login: string;
        name?: string;
        avatar_url?: string;
      };

      const emails = (await emailsResponse.json()) as {
        email: string;
        primary: boolean;
        verified: boolean;
      }[];

      const primaryEmail = emails.find((e) => e.primary && e.verified);
      const fallbackEmail = emails.find((e) => e.verified);
      const email = primaryEmail ?? fallbackEmail;

      return {
        providerId: String(userData.id),
        email: email?.email ?? '',
        emailVerified: email?.verified ?? false,
        name: userData.name,
        avatarUrl: userData.avatar_url,
      };
    },
  };
}
