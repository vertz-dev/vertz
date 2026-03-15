/**
 * Google OAuth provider factory.
 * Uses OIDC with PKCE + nonce. Trusted email (auto-links by verified email).
 */

import type {
  CloudOAuthProviderConfig,
  OAuthProvider,
  OAuthProviderConfig,
  OAuthTokens,
  OAuthUserInfo,
} from '../types';

/** OIDC ID token claims from Google. */
export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
  hd?: string;
  iat: number;
  exp: number;
  aud: string;
  iss: string;
  nonce?: string;
  [key: string]: unknown;
}

const AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_SCOPES = ['openid', 'email', 'profile'];

export function google(config: OAuthProviderConfig | CloudOAuthProviderConfig): OAuthProvider {
  const scopes = config.scopes ?? DEFAULT_SCOPES;

  // Cloud mode — OAuth flows are handled by the cloud proxy
  if (!('clientId' in config)) {
    const cloudError = (method: string) =>
      new Error(`${method}() is not available in cloud mode. OAuth flows are handled by the cloud proxy.`);

    return {
      id: 'google',
      name: 'Google',
      scopes,
      trustEmail: true,
      getAuthorizationUrl() { throw cloudError('getAuthorizationUrl'); },
      async exchangeCode() { throw cloudError('exchangeCode'); },
      async getUserInfo() { throw cloudError('getUserInfo'); },
    };
  }

  return {
    id: 'google',
    name: 'Google',
    scopes,
    trustEmail: true,

    getAuthorizationUrl(state: string, codeChallenge?: string, nonce?: string): string {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUrl ?? '',
        response_type: 'code',
        scope: scopes.join(' '),
        state,
        access_type: 'offline',
        prompt: 'consent',
      });

      if (codeChallenge) {
        params.set('code_challenge', codeChallenge);
        params.set('code_challenge_method', 'S256');
      }

      if (nonce) {
        params.set('nonce', nonce);
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
        id_token?: string;
      };

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        idToken: data.id_token,
      };
    },

    async getUserInfo(
      _accessToken: string,
      idToken?: string,
      nonce?: string,
    ): Promise<OAuthUserInfo> {
      if (!idToken) {
        throw new Error('Google provider requires an ID token');
      }

      // Decode OIDC ID token (JWT payload) without verification
      // The token was received directly from Google's token endpoint over HTTPS
      const parts = idToken.split('.');
      const payload = JSON.parse(atob(parts[1])) as Record<string, unknown>;

      // Validate nonce to prevent ID token replay attacks
      if (nonce && payload.nonce !== nonce) {
        throw new Error('ID token nonce mismatch');
      }

      return {
        providerId: payload.sub as string,
        email: payload.email as string,
        emailVerified: payload.email_verified as boolean,
        raw: payload,
      };
    },
  };
}
