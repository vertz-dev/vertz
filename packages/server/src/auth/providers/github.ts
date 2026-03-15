/**
 * GitHub OAuth provider factory.
 * No PKCE support. Untrusted email (always creates new accounts unless manually linked).
 */

import type {
  CloudOAuthProviderConfig,
  OAuthProvider,
  OAuthProviderConfig,
  OAuthTokens,
  OAuthUserInfo,
} from '../types';

/** Fields returned by GitHub's GET /user API. */
export interface GithubProfile {
  id: number;
  login: string;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  site_admin: boolean;
  name: string | null;
  company: string | null;
  blog: string;
  location: string | null;
  email: string | null;
  hireable: boolean | null;
  bio: string | null;
  twitter_username: string | null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

const AUTHORIZATION_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const EMAILS_URL = 'https://api.github.com/user/emails';
const DEFAULT_SCOPES = ['read:user', 'user:email'];

export function github(config: OAuthProviderConfig | CloudOAuthProviderConfig): OAuthProvider {
  const scopes = config.scopes ?? DEFAULT_SCOPES;

  // Cloud mode — OAuth flows are handled by the cloud proxy
  if (!('clientId' in config)) {
    const cloudError = (method: string) =>
      new Error(`${method}() is not available in cloud mode. OAuth flows are handled by the cloud proxy.`);

    return {
      id: 'github',
      name: 'GitHub',
      scopes,
      trustEmail: false,
      getAuthorizationUrl() { throw cloudError('getAuthorizationUrl'); },
      async exchangeCode() { throw cloudError('exchangeCode'); },
      async getUserInfo() { throw cloudError('getUserInfo'); },
    };
  }

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

      const data = (await response.json()) as Record<string, unknown>;

      if (data.error) {
        throw new Error(`GitHub token exchange failed: ${data.error} — ${data.error_description}`);
      }

      return {
        accessToken: data.access_token as string,
      };
    },

    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
      const [userResponse, emailsResponse] = await Promise.all([
        fetch(USER_URL, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'vertz-auth/1.0',
          },
        }),
        fetch(EMAILS_URL, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'vertz-auth/1.0',
          },
        }),
      ]);

      const userData = (await userResponse.json()) as Record<string, unknown>;

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
        raw: userData,
      };
    },
  };
}
