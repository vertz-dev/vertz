/**
 * Auth Module Implementation - Phase 2
 * Dual-token sessions, email/password authentication
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type AuthError,
  createAuthRateLimitedError,
  createAuthValidationError,
  createInvalidCredentialsError,
  createSessionExpiredError,
  createSessionNotFoundError,
  createUserExistsError,
  err,
  ok,
  type Result,
} from '@vertz/errors';
import { buildRefreshCookie, buildSessionCookie, DEFAULT_COOKIE_CONFIG } from './cookies';
import { sha256Hex } from './crypto';
import { parseDeviceName } from './device-name';
import { createJWT, parseDuration, verifyJWT } from './jwt';
import { hashPassword, validatePassword, verifyPassword } from './password';
import { InMemoryRateLimitStore } from './rate-limit-store';
import { InMemorySessionStore } from './session-store';
import type {
  AuthApi,
  AuthConfig,
  AuthInstance,
  AuthUser,
  Session,
  SessionInfo,
  SessionPayload,
  SignInInput,
  SignUpInput,
} from './types';
import { InMemoryUserStore } from './user-store';

// Re-export password utilities for backward compatibility
export { hashPassword, validatePassword, verifyPassword } from './password';

export function createAuth(config: AuthConfig): AuthInstance {
  const {
    session,
    emailPassword,
    jwtSecret: configJwtSecret,
    jwtAlgorithm = 'HS256',
    claims,
  } = config;

  // Determine production mode: explicit config > process.env > secure default (true)
  const isProduction =
    config.isProduction ??
    (typeof process === 'undefined' ||
      (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test'));

  // Validate JWT secret - throw in production, auto-generate in development
  let jwtSecret: string;

  if (configJwtSecret) {
    jwtSecret = configJwtSecret;
  } else if (isProduction) {
    throw new Error(
      'jwtSecret is required in production. Provide it via createAuth({ jwtSecret: "..." }).',
    );
  } else {
    const secretDir = config.devSecretPath ?? join(process.cwd(), '.vertz');
    const secretFile = join(secretDir, 'jwt-secret');

    if (existsSync(secretFile)) {
      jwtSecret = readFileSync(secretFile, 'utf-8').trim();
    } else {
      jwtSecret = crypto.randomUUID() + crypto.randomUUID();
      mkdirSync(secretDir, { recursive: true });
      writeFileSync(secretFile, jwtSecret, 'utf-8');
      console.warn(
        `[Auth] Auto-generated dev JWT secret at ${secretFile}. Add this path to .gitignore.`,
      );
    }
  }

  // Validate session strategy
  if (session.strategy !== 'jwt') {
    throw new Error(`Session strategy "${session.strategy}" is not yet supported. Use "jwt".`);
  }

  const cookieConfig = { ...DEFAULT_COOKIE_CONFIG, ...session.cookie };
  const refreshName = session.refreshName ?? 'vertz.ref';
  const refreshTtlMs = parseDuration(session.refreshTtl ?? '7d');
  const refreshMaxAge = Math.floor(refreshTtlMs / 1000);

  // Validate cookie security configuration
  if (cookieConfig.sameSite === 'none' && cookieConfig.secure !== true) {
    throw new Error('SameSite=None requires secure=true');
  }

  if (isProduction && cookieConfig.secure === false) {
    throw new Error("Cookie 'secure' flag cannot be disabled in production");
  }

  if (!isProduction && cookieConfig.secure === false) {
    console.warn(
      "Cookie 'secure' flag is disabled. This is allowed in development but must be enabled in production.",
    );
  }

  const ttlMs = parseDuration(session.ttl);

  // Pre-computed dummy hash for timing-safe user enumeration protection.
  // When a sign-in attempt uses an unknown email, we bcrypt.compare against this
  // hash to equalize response time with valid-email attempts.
  const DUMMY_HASH = '$2a$12$000000000000000000000uGWDREoC/y2KhZ5l2QkI4j0LpDjWcaq';

  // Stores — use provided or create defaults
  const sessionStore = config.sessionStore ?? new InMemorySessionStore();
  const userStore = config.userStore ?? new InMemoryUserStore();

  // Rate limiting
  const rateLimitStore = config.rateLimitStore ?? new InMemoryRateLimitStore();
  const signInWindowMs = parseDuration(emailPassword?.rateLimit?.window || '15m');
  const signUpWindowMs = parseDuration('1h');
  const refreshWindowMs = parseDuration('1m');

  // ==========================================================================
  // Helper: Create session tokens
  // ==========================================================================

  async function createSessionTokens(
    user: AuthUser,
    sessionId: string,
  ): Promise<{ jwt: string; refreshToken: string; payload: SessionPayload; expiresAt: Date }> {
    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ttlMs);

    const userClaims = claims ? claims(user) : {};

    const jwt = await createJWT(user, jwtSecret, ttlMs, jwtAlgorithm, () => ({
      ...userClaims,
      jti,
      sid: sessionId,
    }));

    const refreshToken = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const payload: SessionPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      jti,
      sid: sessionId,
      claims: userClaims || undefined,
    };

    return { jwt, refreshToken, payload, expiresAt };
  }

  // ==========================================================================
  // API: Sign Up
  // ==========================================================================

  async function signUp(
    data: SignUpInput,
    ctx?: { headers: Headers },
  ): Promise<Result<Session, AuthError>> {
    const { email, password, role = 'user', ...additionalFields } = data;

    if (!email || !email.includes('@')) {
      return err(createAuthValidationError('Invalid email format', 'email', 'INVALID_FORMAT'));
    }

    const passwordError = validatePassword(password, emailPassword?.password);
    if (passwordError) {
      return err(passwordError);
    }

    // Rate limit check BEFORE user lookup to prevent email enumeration via timing
    const signUpRateLimit = rateLimitStore.check(
      `signup:${email.toLowerCase()}`,
      emailPassword?.rateLimit?.maxAttempts || 3,
      signUpWindowMs,
    );
    if (!signUpRateLimit.allowed) {
      return err(createAuthRateLimitedError('Too many sign up attempts'));
    }

    const existing = await userStore.findByEmail(email.toLowerCase());
    if (existing) {
      return err(createUserExistsError('User already exists', email.toLowerCase()));
    }

    const passwordHash = await hashPassword(password);

    const now = new Date();
    // Spread additionalFields first so core fields cannot be overridden
    const {
      id: _id,
      createdAt: _c,
      updatedAt: _u,
      ...safeFields
    } = additionalFields as Record<string, unknown>;
    const user: AuthUser = {
      ...safeFields,
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      role,
      createdAt: now,
      updatedAt: now,
    };

    await userStore.createUser(user, passwordHash);

    // Pre-generate session ID so tokens are created once with the correct sid
    const sessionId = crypto.randomUUID();
    const tokens = await createSessionTokens(user, sessionId);
    const refreshTokenHash = await sha256Hex(tokens.refreshToken);

    const ipAddress =
      ctx?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      ctx?.headers.get('x-real-ip') ??
      '';
    const userAgent = ctx?.headers.get('user-agent') ?? '';

    await sessionStore.createSessionWithId(sessionId, {
      userId: user.id,
      refreshTokenHash,
      ipAddress,
      userAgent,
      expiresAt: new Date(Date.now() + refreshTtlMs),
      currentTokens: { jwt: tokens.jwt, refreshToken: tokens.refreshToken },
    });

    return ok({
      user,
      expiresAt: tokens.expiresAt,
      payload: tokens.payload,
      tokens: { jwt: tokens.jwt, refreshToken: tokens.refreshToken },
    });
  }

  // ==========================================================================
  // API: Sign In
  // ==========================================================================

  async function signIn(
    data: SignInInput,
    ctx?: { headers: Headers },
  ): Promise<Result<Session, AuthError>> {
    const { email, password } = data;

    // Rate limit check BEFORE user lookup to prevent email enumeration via timing
    const signInRateLimit = rateLimitStore.check(
      `signin:${email.toLowerCase()}`,
      emailPassword?.rateLimit?.maxAttempts || 5,
      signInWindowMs,
    );
    if (!signInRateLimit.allowed) {
      return err(createAuthRateLimitedError('Too many sign in attempts'));
    }

    const stored = await userStore.findByEmail(email.toLowerCase());
    if (!stored) {
      // Timing-safe: perform dummy bcrypt compare to equalize response time
      // with valid-email attempts, preventing user enumeration via timing.
      await verifyPassword(password, DUMMY_HASH);
      return err(createInvalidCredentialsError());
    }

    // OAuth-only user (no password set) — reject email/password sign-in
    if (stored.passwordHash === null) {
      await verifyPassword(password, DUMMY_HASH);
      return err(createInvalidCredentialsError());
    }

    const valid = await verifyPassword(password, stored.passwordHash);
    if (!valid) {
      return err(createInvalidCredentialsError());
    }

    const user = stored.user;

    // Pre-generate session ID so tokens are created once with the correct sid
    const sessionId = crypto.randomUUID();
    const tokens = await createSessionTokens(user, sessionId);
    const refreshTokenHash = await sha256Hex(tokens.refreshToken);

    const ipAddress =
      ctx?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      ctx?.headers.get('x-real-ip') ??
      '';
    const userAgent = ctx?.headers.get('user-agent') ?? '';

    await sessionStore.createSessionWithId(sessionId, {
      userId: user.id,
      refreshTokenHash,
      ipAddress,
      userAgent,
      expiresAt: new Date(Date.now() + refreshTtlMs),
      currentTokens: { jwt: tokens.jwt, refreshToken: tokens.refreshToken },
    });

    return ok({
      user,
      expiresAt: tokens.expiresAt,
      payload: tokens.payload,
      tokens: { jwt: tokens.jwt, refreshToken: tokens.refreshToken },
    });
  }

  // ==========================================================================
  // API: Sign Out
  // ==========================================================================

  async function signOut(ctx: { headers: Headers }): Promise<Result<void, AuthError>> {
    // Get session from JWT to find session ID
    const sessionResult = await getSession(ctx.headers);
    if (sessionResult.ok && sessionResult.data) {
      await sessionStore.revokeSession(sessionResult.data.payload.sid);
    }
    return ok(undefined);
  }

  // ==========================================================================
  // API: Get Session (JWT-only verification — stateless for 60s window)
  // ==========================================================================

  async function getSession(headers: Headers): Promise<Result<Session | null, AuthError>> {
    const cookieName = cookieConfig.name || 'vertz.sid';
    const cookieEntry = headers
      .get('cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith(`${cookieName}=`));
    const token = cookieEntry ? cookieEntry.trim().slice(`${cookieName}=`.length) : undefined;

    if (!token) {
      return ok(null);
    }

    // Phase 2: JWT-only verification — no session Map lookup
    const payload = await verifyJWT(token, jwtSecret, jwtAlgorithm);
    if (!payload) {
      return ok(null);
    }

    // Get user from store by ID (not email — email can change)
    const user = await userStore.findById(payload.sub);
    if (!user) {
      return ok(null);
    }

    const expiresAt = new Date(payload.exp * 1000);

    return ok({ user, expiresAt, payload });
  }

  // ==========================================================================
  // API: Refresh Session
  // ==========================================================================

  async function refreshSession(ctx: { headers: Headers }): Promise<Result<Session, AuthError>> {
    const refreshRateLimit = rateLimitStore.check(
      `refresh:${ctx.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'default'}`,
      10,
      refreshWindowMs,
    );
    if (!refreshRateLimit.allowed) {
      return err(createAuthRateLimitedError('Too many refresh attempts'));
    }

    // Read refresh token from vertz.ref cookie
    const refreshEntry = ctx.headers
      .get('cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith(`${refreshName}=`));
    const refreshToken = refreshEntry
      ? refreshEntry.trim().slice(`${refreshName}=`.length)
      : undefined;

    if (!refreshToken) {
      return err(createSessionExpiredError('No refresh token'));
    }

    const refreshHash = await sha256Hex(refreshToken);

    // Find session by current refresh hash
    let storedSession = await sessionStore.findByRefreshHash(refreshHash);
    let isGracePeriod = false;

    if (!storedSession) {
      // Check grace period — old token within 10s
      storedSession = await sessionStore.findByPreviousRefreshHash(refreshHash);
      if (storedSession && storedSession.lastActiveAt.getTime() + 10_000 > Date.now()) {
        isGracePeriod = true;
      } else {
        return err(createSessionExpiredError('Invalid refresh token'));
      }
    }

    // Load fresh user data
    const user = await userStore.findById(storedSession.userId);
    if (!user) {
      return err(createSessionExpiredError('User not found'));
    }

    if (isGracePeriod) {
      // Idempotent: return the current tokens without re-verification.
      // The tokens were just issued during the rotation that created the grace period,
      // so re-verifying the JWT is unnecessary and would fail if the JWT TTL is very short.
      const currentTokens = await sessionStore.getCurrentTokens(storedSession.id);
      if (currentTokens) {
        // Decode (without verify) to get the payload for the response
        const payload = await verifyJWT(currentTokens.jwt, jwtSecret, jwtAlgorithm);
        // Even if JWT is expired, return the cached tokens — the client will get
        // a fresh JWT on the next refresh after the grace period ends
        return ok({
          user,
          expiresAt: payload ? new Date(payload.exp * 1000) : new Date(Date.now() + ttlMs),
          payload: payload ?? {
            sub: user.id,
            email: user.email,
            role: user.role,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor((Date.now() + ttlMs) / 1000),
            jti: '',
            sid: storedSession.id,
          },
          tokens: currentTokens,
        });
      }
    }

    // Generate new tokens (rotation)
    const newTokens = await createSessionTokens(user, storedSession.id);
    const newRefreshHash = await sha256Hex(newTokens.refreshToken);

    await sessionStore.updateSession(storedSession.id, {
      refreshTokenHash: newRefreshHash,
      previousRefreshHash: storedSession.refreshTokenHash,
      lastActiveAt: new Date(),
      currentTokens: { jwt: newTokens.jwt, refreshToken: newTokens.refreshToken },
    });

    return ok({
      user,
      expiresAt: newTokens.expiresAt,
      payload: newTokens.payload,
      tokens: { jwt: newTokens.jwt, refreshToken: newTokens.refreshToken },
    });
  }

  // ==========================================================================
  // API: List Sessions
  // ==========================================================================

  async function listSessions(headers: Headers): Promise<Result<SessionInfo[], AuthError>> {
    const sessionResult = await getSession(headers);
    if (!sessionResult.ok) return sessionResult as Result<SessionInfo[], AuthError>;
    if (!sessionResult.data) {
      return err(createSessionExpiredError('Not authenticated'));
    }

    const currentSid = sessionResult.data.payload.sid;
    const sessions = await sessionStore.listActiveSessions(sessionResult.data.user.id);

    const infos: SessionInfo[] = sessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      deviceName: parseDeviceName(s.userAgent),
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
      expiresAt: s.expiresAt,
      isCurrent: s.id === currentSid,
    }));

    return ok(infos);
  }

  // ==========================================================================
  // API: Revoke Session
  // ==========================================================================

  async function revokeSessionById(
    sessionId: string,
    headers: Headers,
  ): Promise<Result<void, AuthError>> {
    const sessionResult = await getSession(headers);
    if (!sessionResult.ok) return sessionResult as Result<void, AuthError>;
    if (!sessionResult.data) {
      return err(createSessionExpiredError('Not authenticated'));
    }

    // Verify ownership — only allow revoking sessions that belong to the current user
    const targetSessions = await sessionStore.listActiveSessions(sessionResult.data.user.id);
    const target = targetSessions.find((s) => s.id === sessionId);
    if (!target) {
      return err(createSessionNotFoundError('Session not found'));
    }

    await sessionStore.revokeSession(sessionId);
    return ok(undefined);
  }

  // ==========================================================================
  // API: Revoke All Sessions (except current)
  // ==========================================================================

  async function revokeAllSessions(headers: Headers): Promise<Result<void, AuthError>> {
    const sessionResult = await getSession(headers);
    if (!sessionResult.ok) return sessionResult as Result<void, AuthError>;
    if (!sessionResult.data) {
      return err(createSessionExpiredError('Not authenticated'));
    }

    const currentSid = sessionResult.data.payload.sid;
    const sessions = await sessionStore.listActiveSessions(sessionResult.data.user.id);

    for (const s of sessions) {
      if (s.id !== currentSid) {
        await sessionStore.revokeSession(s.id);
      }
    }

    return ok(undefined);
  }

  // ==========================================================================
  // HTTP Handler
  // ==========================================================================

  function authErrorToStatus(error: AuthError): number {
    switch (error.code) {
      case 'AUTH_VALIDATION_ERROR':
        return 400;
      case 'INVALID_CREDENTIALS':
        return 401;
      case 'SESSION_EXPIRED':
        return 401;
      case 'SESSION_NOT_FOUND':
        return 404;
      case 'USER_EXISTS':
        return 409;
      case 'RATE_LIMITED':
        return 429;
      case 'PERMISSION_DENIED':
        return 403;
      default:
        return 500;
    }
  }

  function securityHeaders(): Record<string, string> {
    return {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    };
  }

  async function handleAuthRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/auth', '') || '/';
    const method = request.method;

    // CSRF check for state-changing methods
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const origin = request.headers.get('origin');
      const referer = request.headers.get('referer');
      const expectedOrigin = new URL(request.url).origin;

      let originValid = false;

      if (origin) {
        originValid = origin === expectedOrigin;
      } else if (referer) {
        try {
          const refererOrigin = new URL(referer).origin;
          originValid = refererOrigin === expectedOrigin;
        } catch {
          originValid = false;
        }
      }

      if (!originValid) {
        if (isProduction) {
          return new Response(JSON.stringify({ error: 'CSRF validation failed' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        } else {
          console.warn(
            '[Auth] CSRF warning: Origin/Referer missing or mismatched (allowed in development)',
          );
        }
      }

      const vtzHeader = request.headers.get('x-vtz-request');

      if (vtzHeader !== '1') {
        if (isProduction) {
          return new Response(JSON.stringify({ error: 'Missing required X-VTZ-Request header' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        } else {
          console.warn(
            '[Auth] CSRF warning: Missing X-VTZ-Request header (allowed in development)',
          );
        }
      }
    }

    try {
      // Route: POST /api/auth/signup
      if (method === 'POST' && path === '/signup') {
        const body = (await request.json()) as SignUpInput;
        const result = await signUp(body, { headers: request.headers });

        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: authErrorToStatus(result.error),
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const headers = new Headers({
          'Content-Type': 'application/json',
          ...securityHeaders(),
        });
        if (result.data.tokens) {
          headers.append('Set-Cookie', buildSessionCookie(result.data.tokens.jwt, cookieConfig));
          headers.append(
            'Set-Cookie',
            buildRefreshCookie(
              result.data.tokens.refreshToken,
              cookieConfig,
              refreshName,
              refreshMaxAge,
            ),
          );
        }

        return new Response(JSON.stringify({ user: result.data.user }), {
          status: 201,
          headers,
        });
      }

      // Route: POST /api/auth/signin
      if (method === 'POST' && path === '/signin') {
        const body = (await request.json()) as SignInInput;
        const result = await signIn(body, { headers: request.headers });

        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: authErrorToStatus(result.error),
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const headers = new Headers({
          'Content-Type': 'application/json',
          ...securityHeaders(),
        });
        if (result.data.tokens) {
          headers.append('Set-Cookie', buildSessionCookie(result.data.tokens.jwt, cookieConfig));
          headers.append(
            'Set-Cookie',
            buildRefreshCookie(
              result.data.tokens.refreshToken,
              cookieConfig,
              refreshName,
              refreshMaxAge,
            ),
          );
        }

        return new Response(JSON.stringify({ user: result.data.user }), {
          status: 200,
          headers,
        });
      }

      // Route: POST /api/auth/signout
      if (method === 'POST' && path === '/signout') {
        await signOut({ headers: request.headers });

        const headers = new Headers({
          'Content-Type': 'application/json',
          ...securityHeaders(),
        });
        headers.append('Set-Cookie', buildSessionCookie('', cookieConfig, true));
        headers.append(
          'Set-Cookie',
          buildRefreshCookie('', cookieConfig, refreshName, refreshMaxAge, true),
        );

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers,
        });
      }

      // Route: GET /api/auth/session
      if (method === 'GET' && path === '/session') {
        const result = await getSession(request.headers);

        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        return new Response(JSON.stringify({ session: result.data }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...securityHeaders() },
        });
      }

      // Route: POST /api/auth/refresh
      if (method === 'POST' && path === '/refresh') {
        const result = await refreshSession({ headers: request.headers });

        if (!result.ok) {
          const headers = new Headers({
            'Content-Type': 'application/json',
            ...securityHeaders(),
          });
          // Clear both cookies on failure
          headers.append('Set-Cookie', buildSessionCookie('', cookieConfig, true));
          headers.append(
            'Set-Cookie',
            buildRefreshCookie('', cookieConfig, refreshName, refreshMaxAge, true),
          );
          return new Response(JSON.stringify({ error: result.error }), {
            status: authErrorToStatus(result.error),
            headers,
          });
        }

        const headers = new Headers({
          'Content-Type': 'application/json',
          ...securityHeaders(),
        });
        if (result.data.tokens) {
          headers.append('Set-Cookie', buildSessionCookie(result.data.tokens.jwt, cookieConfig));
          headers.append(
            'Set-Cookie',
            buildRefreshCookie(
              result.data.tokens.refreshToken,
              cookieConfig,
              refreshName,
              refreshMaxAge,
            ),
          );
        }

        return new Response(JSON.stringify({ user: result.data.user }), {
          status: 200,
          headers,
        });
      }

      // Route: GET /api/auth/sessions
      if (method === 'GET' && path === '/sessions') {
        const result = await listSessions(request.headers);

        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: authErrorToStatus(result.error),
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        return new Response(JSON.stringify({ sessions: result.data }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...securityHeaders() },
        });
      }

      // Route: DELETE /api/auth/sessions/:id
      if (method === 'DELETE' && path.startsWith('/sessions/')) {
        const sessionId = path.replace('/sessions/', '');
        const result = await revokeSessionById(sessionId, request.headers);

        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: authErrorToStatus(result.error),
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...securityHeaders() },
        });
      }

      // Route: DELETE /api/auth/sessions
      if (method === 'DELETE' && path === '/sessions') {
        const result = await revokeAllSessions(request.headers);

        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: authErrorToStatus(result.error),
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...securityHeaders() },
        });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (_error) {
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ==========================================================================
  // Middleware
  // ==========================================================================

  function createMiddleware() {
    return async (ctx: Record<string, unknown>, next: () => Promise<void>) => {
      const sessionResult = await getSession(ctx.headers as Headers);

      if (sessionResult.ok && sessionResult.data) {
        ctx.user = sessionResult.data.user;
        ctx.session = sessionResult.data;
      } else {
        ctx.user = null;
        ctx.session = null;
      }

      await next();
    };
  }

  // ==========================================================================
  // Initialize
  // ==========================================================================

  async function initialize(): Promise<void> {
    console.log('[Auth] Initialized with JWT strategy');
  }

  // Return the auth instance
  const api: AuthApi = {
    signUp,
    signIn,
    signOut,
    getSession,
    refreshSession,
    listSessions,
    revokeSession: revokeSessionById,
    revokeAllSessions,
  };

  return {
    handler: handleAuthRequest,
    api,
    middleware: createMiddleware,
    initialize,
    dispose() {
      sessionStore.dispose();
      rateLimitStore.dispose();
    },
  };
}

export type {
  AccessConfig,
  AccessInstance,
  Entitlement,
  EntitlementDefinition,
  Resource,
} from './access';
// Re-export access control from auth/access.ts
export { AuthorizationError, createAccess, defaultAccess } from './access';
export { InMemoryRateLimitStore } from './rate-limit-store';

// Re-export store implementations
export { InMemorySessionStore } from './session-store';
// Re-export types from types.ts
export type {
  AuthApi,
  AuthConfig,
  AuthContext,
  AuthInstance,
  AuthTokens,
  AuthUser,
  CookieConfig,
  EmailPasswordConfig,
  PasswordRequirements,
  RateLimitConfig,
  RateLimitResult,
  RateLimitStore,
  RoleAssignmentTableEntry,
  Session,
  SessionConfig,
  SessionInfo,
  SessionPayload,
  SessionStore,
  SessionStrategy,
  SignInInput,
  SignUpInput,
  StoredSession,
  UserStore,
  UserTableEntry,
} from './types';
export { InMemoryUserStore } from './user-store';
