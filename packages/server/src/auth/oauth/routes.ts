/**
 * OAuth Routes - Phase 2
 * HTTP handlers for OAuth routes (initiate, callback)
 */

import type { OAuthProvider, OAuthUserInfo, OAuthTokens } from './types';
import { createPKCE, generateState, OAuthStateStore, createOAuthError, type OAuthSecurityError } from './security';
import { createOAuthCallbackHandler } from './callback';
import * as jose from 'jose';

// ============================================================================
// Route Configuration
// ============================================================================

export interface OAuthRouteConfig {
  provider: OAuthProvider;
  stateStore: OAuthStateStore;
  jwtSecret: string;
  jwtAlgorithm?: string;
  sessionTtl?: number;
  cookieName?: string;
  // User lookup/creation callbacks
  findOrCreateUser?: (userInfo: OAuthUserInfo) => Promise<{ user: any; isNew: boolean }>;
}

export interface OAuthRoutes {
  initiate: (request: Request) => Promise<Response>;
  callback: (request: Request) => Promise<Response>;
}

// ============================================================================
// OAuth Routes Factory
// ============================================================================

export function createOAuthRoutes(config: OAuthRouteConfig): OAuthRoutes {
  const {
    provider,
    stateStore,
    jwtSecret,
    jwtAlgorithm = 'HS256',
    sessionTtl = 60 * 60 * 24 * 7 * 1000,
    cookieName = 'vertz.sid',
    findOrCreateUser,
  } = config;

  /**
   * GET /auth/oauth/:provider - Initiate OAuth flow
   */
  async function initiate(request: Request): Promise<Response> {
    try {
      // Generate state and PKCE
      const state = generateState();
      const pkce = createPKCE();
      
      // Store state with redirect URI
      const url = new URL(request.url);
      const redirectUri = `${url.origin}/api/auth/callback/${provider.id}`;
      stateStore.set(state, redirectUri);

      // Build authorization URL with PKCE
      const authUrl = provider.getAuthorizationUrl(state, pkce);

      // Note: In a real implementation, we'd store the PKCE verifier in a secure
      // session or encrypted cookie. For now, we'll encode it in a cookie.
      const pkceCookie = buildPkceCookie(pkce.codeVerifier);

      // Redirect to provider
      return new Response(null, {
        status: 302,
        headers: {
          Location: authUrl,
          'Set-Cookie': pkceCookie,
        },
      });
    } catch (error) {
      return jsonError(
        createOAuthError(
          'OAUTH_PROVIDER_ERROR',
          `Failed to initiate OAuth: ${error instanceof Error ? error.message : 'Unknown error'}`,
          500,
          provider.id
        )
      );
    }
  }

  /**
   * GET /auth/callback/:provider - OAuth callback
   */
  async function callback(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const params = url.searchParams;
      
      const code = params.get('code');
      const state = params.get('state');
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      // Get PKCE verifier from cookie
      const cookieHeader = request.headers.get('cookie') || '';
      const pkceVerifier = extractPkceVerifier(cookieHeader);

      // Validate state
      if (!state || !stateStore.validate(state)) {
        return jsonError(
          createOAuthError(
            'OAUTH_INVALID_STATE',
            'Invalid or expired state parameter. Please try again.',
            400,
            provider.id
          )
        );
      }

      // Check for OAuth errors
      if (error) {
        if (error === 'access_denied') {
          return jsonError(
            createOAuthError(
              'OAUTH_ACCESS_DENIED',
              errorDescription || 'User denied authorization',
              403,
              provider.id
            )
          );
        }
        return jsonError(
          createOAuthError(
            'OAUTH_PROVIDER_ERROR',
            errorDescription || error,
            400,
            provider.id
          )
        );
      }

      // Validate code
      if (!code) {
        return jsonError(
          createOAuthError(
            'OAUTH_EXCHANGE_FAILED',
            'No authorization code provided',
            400,
            provider.id
          )
        );
      }

      // Exchange code for tokens
      let tokens: OAuthTokens;
      try {
        tokens = await provider.exchangeCode(code, pkceVerifier);
      } catch (error) {
        return jsonError(
          createOAuthError(
            'OAUTH_EXCHANGE_FAILED',
            `Failed to exchange code: ${error instanceof Error ? error.message : 'Unknown error'}`,
            500,
            provider.id
          )
        );
      }

      // Get user info
      let userInfo: OAuthUserInfo;
      try {
        userInfo = await provider.getUserInfo(tokens.accessToken);
      } catch (error) {
        return jsonError(
          createOAuthError(
            'OAUTH_USER_INFO_FAILED',
            `Failed to get user info: ${error instanceof Error ? error.message : 'Unknown error'}`,
            500,
            provider.id
          )
        );
      }

      // Find or create user (if callback provided)
      let user = userInfo;
      let isNewUser = false;
      
      if (findOrCreateUser) {
        const result = await findOrCreateUser(userInfo);
        user = result.user;
        isNewUser = result.isNew;
      }

      // Create JWT session
      const sessionToken = await createSessionToken(user, jwtSecret, jwtAlgorithm, sessionTtl);

      // Build response with cookie
      const sessionCookie = buildSessionCookie(cookieName, sessionToken, sessionTtl);

      // Redirect to original page or default
      const redirectTo = params.get('redirect_uri') || '/';
      
      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectTo,
          'Set-Cookie': sessionCookie,
        },
      });
    } catch (error) {
      return jsonError(
        createOAuthError(
          'OAUTH_EXCHANGE_FAILED',
          `Callback error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          500,
          provider.id
        )
      );
    }
  }

  return { initiate, callback };
}

// ============================================================================
// JWT Session Creation
// ============================================================================

async function createSessionToken(
  user: any,
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

// ============================================================================
// Cookie Helpers
// ============================================================================

function buildSessionCookie(name: string, value: string, maxAgeMs: number): string {
  const maxAge = Math.floor(maxAgeMs / 1000);
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function buildPkceCookie(verifier: string): string {
  return `pkce_verifier=${verifier}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
}

function extractPkceVerifier(cookieHeader: string): string | undefined {
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const pkceCookie = cookies.find(c => c.startsWith('pkce_verifier='));
  if (pkceCookie) {
    return pkceCookie.split('=')[1];
  }
  return undefined;
}

function jsonError(error: OAuthSecurityError): Response {
  return new Response(JSON.stringify({ error }), {
    status: error.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// OAuth Router
// ============================================================================

export interface OAuthRouterOptions {
  providers: Map<string, OAuthRouteConfig>;
  defaultCallbackPath?: string;
}

export function createOAuthRouter(options: OAuthRouterOptions) {
  const { providers, defaultCallbackPath = '/api/auth/callback' } = options;

  /**
   * Handle OAuth requests
   */
  return async function handleOAuthRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Match: /api/auth/oauth/:provider
    const initiateMatch = path.match(/^\/api\/auth\/oauth\/([^/]+)$/);
    if (method === 'GET' && initiateMatch) {
      const providerId = initiateMatch[1];
      const config = providers.get(providerId);
      
      if (!config) {
        return new Response(JSON.stringify({ error: 'Unknown provider' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const routes = createOAuthRoutes(config);
      return routes.initiate(request);
    }

    // Match: /api/auth/callback/:provider
    const callbackMatch = path.match(/^\/api\/auth\/callback\/([^/]+)$/);
    if (method === 'GET' && callbackMatch) {
      const providerId = callbackMatch[1];
      const config = providers.get(providerId);
      
      if (!config) {
        return new Response(JSON.stringify({ error: 'Unknown provider' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const routes = createOAuthRoutes(config);
      return routes.callback(request);
    }

    // No match
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
