/**
 * OAuth Callback Handler - Phase 2
 * Handles OAuth callback, validates state, exchanges code, creates session
 */

import type { OAuthProvider, OAuthTokens, OAuthUserInfo } from './types';
import { createOAuthError, type OAuthSecurityError } from './security';
import * as jose from 'jose';

// ============================================================================
// Callback Handler Types
// ============================================================================

export interface OAuthCallbackParams {
  code: string;
  state: string;
  error?: string;
  error_description?: string;
}

export interface CreateOAuthHandlerOptions {
  provider: OAuthProvider;
  stateStore: any; // OAuthStateStore
  jwtSecret: string;
  jwtAlgorithm?: string;
  sessionTtl?: number;
  cookieName?: string;
}

export interface OAuthSessionResult {
  user: OAuthUserInfo;
  tokens: OAuthTokens;
  cookie: string;
}

// ============================================================================
// OAuth Callback Handler
// ============================================================================

export function createOAuthCallbackHandler(options: CreateOAuthHandlerOptions) {
  const {
    provider,
    stateStore,
    jwtSecret,
    jwtAlgorithm = 'HS256',
    sessionTtl = 60 * 60 * 24 * 7 * 1000, // 7 days in ms
    cookieName = 'vertz.sid',
  } = options;

  /**
   * Handle the OAuth callback
   */
  return async function handleCallback(
    params: OAuthCallbackParams
  ): Promise<{ ok: true; data: OAuthSessionResult } | { ok: false; error: OAuthSecurityError }> {
    
    // 1. Check for OAuth error from provider (user denied)
    if (params.error) {
      if (params.error === 'access_denied') {
        return {
          ok: false,
          error: createOAuthError(
            'OAUTH_ACCESS_DENIED',
            params.error_description || 'User denied authorization',
            403,
            provider.id
          ),
        };
      }
      return {
        ok: false,
        error: createOAuthError(
          'OAUTH_PROVIDER_ERROR',
          params.error_description || params.error,
          400,
          provider.id
        ),
      };
    }

    // 2. Validate state
    if (!params.state) {
      return {
        ok: false,
        error: createOAuthError(
          'OAUTH_INVALID_STATE',
          'Missing state parameter',
          400,
          provider.id
        ),
      };
    }

    const isValidState = stateStore.validate(params.state);
    if (!isValidState) {
      return {
        ok: false,
        error: createOAuthError(
          'OAUTH_INVALID_STATE',
          'Invalid or expired state parameter. Please try again.',
          400,
          provider.id
        ),
      };
    }

    // 3. Exchange code for tokens
    let tokens: OAuthTokens;
    try {
      tokens = await provider.exchangeCode(params.code);
    } catch (error) {
      return {
        ok: false,
        error: createOAuthError(
          'OAUTH_EXCHANGE_FAILED',
          `Failed to exchange code for tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
          500,
          provider.id,
          error instanceof Error ? error : undefined
        ),
      };
    }

    // 4. Get user info
    let userInfo: OAuthUserInfo;
    try {
      userInfo = await provider.getUserInfo(tokens.accessToken);
    } catch (error) {
      return {
        ok: false,
        error: createOAuthError(
          'OAUTH_USER_INFO_FAILED',
          `Failed to fetch user info: ${error instanceof Error ? error.message : 'Unknown error'}`,
          500,
          provider.id,
          error instanceof Error ? error : undefined
        ),
      };
    }

    // 5. Create JWT session
    let sessionToken: string;
    try {
      sessionToken = await createSessionToken(userInfo, jwtSecret, jwtAlgorithm, sessionTtl);
    } catch (error) {
      return {
        ok: false,
        error: createOAuthError(
          'OAUTH_EXCHANGE_FAILED',
          `Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`,
          500,
          provider.id,
          error instanceof Error ? error : undefined
        ),
      };
    }

    // 6. Build cookie
    const cookie = buildAuthCookie(cookieName, sessionToken, sessionTtl);

    return {
      ok: true,
      data: {
        user: userInfo,
        tokens,
        cookie,
      },
    };
  };
}

// ============================================================================
// JWT Session Creation (reusing Phase 1 logic)
// ============================================================================

async function createSessionToken(
  user: OAuthUserInfo,
  secret: string,
  algorithm: string,
  ttlMs: number
): Promise<string> {
  const claims = {
    sub: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    provider: user.provider,
  };

  const jwt = await new jose.SignJWT(claims)
    .setProtectedHeader({ alg: algorithm })
    .setIssuedAt()
    .setExpirationTime(Math.floor(ttlMs / 1000))
    .sign(new TextEncoder().encode(secret));

  return jwt;
}

function buildAuthCookie(name: string, value: string, maxAgeMs: number): string {
  const maxAge = Math.floor(maxAgeMs / 1000);
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// ============================================================================
// OAuth Initiation Handler
// ============================================================================

export function createOAuthInitiateHandler(options: {
  provider: OAuthProvider;
  stateStore: any; // OAuthStateStore
  redirectUri?: string;
}) {
  const { provider, stateStore, redirectUri } = options;

  return function initiate(): { redirectUrl: string; state: string } {
    // Generate cryptographically random state
    const state = generateRandomState();
    
    // Store state for validation later
    const callbackUri = redirectUri || provider.config.redirectUri || `/api/auth/callback/${provider.id}`;
    stateStore.set(state, callbackUri);

    // Generate PKCE
    const pkce = createPKCE();

    // Build authorization URL with PKCE
    const redirectUriFinal = redirectUri || provider.config.redirectUri || callbackUri;
    const authUrl = provider.getAuthorizationUrl(state, pkce);

    // For now, state contains both state param and PKCE verifier
    // In production, you'd store PKCE verifier separately or in a secure session
    // Here we're just returning the URL - the verifier would be stored in a session cookie
    return {
      redirectUrl: authUrl,
      state: state,
    };
  };
}

function generateRandomState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = Buffer.from(buffer).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Re-export PKCE and state functions
import { createPKCE } from './security';
