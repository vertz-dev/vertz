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
  createMfaAlreadyEnabledError,
  createMfaInvalidCodeError,
  createMfaNotEnabledError,
  createMfaRequiredError,
  createSessionExpiredError,
  createSessionNotFoundError,
  createTokenExpiredError,
  createTokenInvalidError,
  createUserExistsError,
  err,
  ok,
  type Result,
} from '@vertz/errors';
import { computeAccessSet, type EncodedAccessSet, encodeAccessSet } from './access-set';
import {
  buildMfaChallengeCookie,
  buildOAuthStateCookie,
  buildRefreshCookie,
  buildSessionCookie,
  DEFAULT_COOKIE_CONFIG,
} from './cookies';
import {
  decrypt,
  encrypt,
  generateCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  sha256Hex,
} from './crypto';
import { parseDeviceName } from './device-name';
import { InMemoryEmailVerificationStore } from './email-verification-store';
import { createJWT, parseDuration, verifyJWT } from './jwt';
import { InMemoryMFAStore } from './mfa-store';
import { InMemoryOAuthAccountStore } from './oauth-account-store';
import { hashPassword, validatePassword, verifyPassword } from './password';
import { InMemoryPasswordResetStore } from './password-reset-store';
import { InMemoryRateLimitStore } from './rate-limit-store';
import { InMemorySessionStore } from './session-store';
import {
  generateBackupCodes,
  generateTotpSecret,
  generateTotpUri,
  hashBackupCode,
  verifyBackupCode,
  verifyTotpCode,
} from './totp';
import type {
  AuthApi,
  AuthConfig,
  AuthInstance,
  AuthUser,
  OAuthProvider,
  OAuthStateData,
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

  // OAuth setup
  const providers = new Map<string, OAuthProvider>();
  if (config.providers) {
    for (const provider of config.providers) {
      providers.set(provider.id, provider);
    }
  }
  const oauthAccountStore =
    config.oauthAccountStore ?? (providers.size > 0 ? new InMemoryOAuthAccountStore() : undefined);
  const oauthEncryptionKey = config.oauthEncryptionKey;
  const oauthSuccessRedirect = config.oauthSuccessRedirect ?? '/';
  const oauthErrorRedirect = config.oauthErrorRedirect ?? '/auth/error';

  // MFA setup
  const mfaConfig = config.mfa;
  const mfaEnabled = mfaConfig?.enabled ?? false;
  const mfaIssuer = mfaConfig?.issuer ?? 'Vertz';
  const mfaBackupCodeCount = mfaConfig?.backupCodeCount ?? 10;
  const mfaStore = config.mfaStore ?? (mfaEnabled ? new InMemoryMFAStore() : undefined);
  // Pending MFA secrets: userId → { secret, createdAt } (cleared after verify-setup or after 10min TTL)
  const PENDING_MFA_TTL = 10 * 60 * 1000; // 10 minutes
  const pendingMfaSecrets = new Map<string, { secret: string; createdAt: number }>();

  // Email verification setup
  const emailVerificationConfig = config.emailVerification;
  const emailVerificationEnabled = emailVerificationConfig?.enabled ?? false;
  const emailVerificationTtlMs = parseDuration(emailVerificationConfig?.tokenTtl ?? '24h');
  const emailVerificationStore =
    config.emailVerificationStore ??
    (emailVerificationEnabled ? new InMemoryEmailVerificationStore() : undefined);

  // Password reset setup
  const passwordResetConfig = config.passwordReset;
  const passwordResetEnabled = passwordResetConfig?.enabled ?? false;
  const passwordResetTtlMs = parseDuration(passwordResetConfig?.tokenTtl ?? '1h');
  const revokeSessionsOnReset = passwordResetConfig?.revokeSessionsOnReset ?? true;
  const passwordResetStore =
    config.passwordResetStore ??
    (passwordResetEnabled ? new InMemoryPasswordResetStore() : undefined);

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
    options?: { fva?: number },
  ): Promise<{ jwt: string; refreshToken: string; payload: SessionPayload; expiresAt: Date }> {
    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ttlMs);

    const userClaims = claims ? claims(user) : {};
    const fvaClaim = options?.fva !== undefined ? { fva: options.fva } : {};

    // Compute ACL claim if access config is present
    let aclClaim: { acl: { set?: EncodedAccessSet; hash: string; overflow: boolean } } | object =
      {};
    if (config.access) {
      const accessSet = await computeAccessSet({
        userId: user.id,
        accessDef: config.access.definition,
        roleStore: config.access.roleStore,
        closureStore: config.access.closureStore,
        flagStore: config.access.flagStore,
        plan: user.plan ?? null,
      });
      const encoded = encodeAccessSet(accessSet);
      const canonicalJson = JSON.stringify(encoded);
      // Hash only stable fields (not computedAt) for cache comparison
      const stablePayload = {
        entitlements: encoded.entitlements,
        flags: encoded.flags,
        plan: encoded.plan,
      };
      const hash = await sha256Hex(JSON.stringify(stablePayload));
      const byteLength = new TextEncoder().encode(canonicalJson).length;

      if (byteLength <= 2048) {
        aclClaim = { acl: { set: encoded, hash, overflow: false } };
      } else {
        aclClaim = { acl: { hash, overflow: true } };
      }
    }

    const jwt = await createJWT(user, jwtSecret, ttlMs, jwtAlgorithm, () => ({
      ...userClaims,
      ...fvaClaim,
      ...aclClaim,
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
      ...(options?.fva !== undefined ? { fva: options.fva } : {}),
      ...aclClaim,
    };

    return { jwt, refreshToken, payload, expiresAt };
  }

  // ==========================================================================
  // Helper: Generate random hex token (32 bytes = 64 hex chars)
  // ==========================================================================

  function generateToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
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
    const signUpRateLimit = await rateLimitStore.check(
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
      emailVerified: !emailVerificationEnabled,
      createdAt: now,
      updatedAt: now,
    };

    await userStore.createUser(user, passwordHash);

    // Send verification email if enabled
    if (emailVerificationEnabled && emailVerificationStore && emailVerificationConfig?.onSend) {
      const token = generateToken();
      const tokenHash = await sha256Hex(token);
      await emailVerificationStore.createVerification({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + emailVerificationTtlMs),
      });
      await emailVerificationConfig.onSend(user, token);
    }

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
    const signInRateLimit = await rateLimitStore.check(
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

    // Check if MFA is enabled — return challenge instead of session
    if (mfaStore && (await mfaStore.isMfaEnabled(user.id))) {
      return err(createMfaRequiredError('MFA verification required'));
    }

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
    const refreshRateLimit = await rateLimitStore.check(
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

    // Preserve fva claim from the old session JWT (if present)
    let existingFva: number | undefined;
    const oldTokens = await sessionStore.getCurrentTokens(storedSession.id);
    if (oldTokens) {
      const oldPayload = await verifyJWT(oldTokens.jwt, jwtSecret, jwtAlgorithm);
      existingFva = oldPayload?.fva;
    }

    // Generate new tokens (rotation)
    const newTokens = await createSessionTokens(
      user,
      storedSession.id,
      existingFva !== undefined ? { fva: existingFva } : undefined,
    );
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

        return new Response(
          JSON.stringify({
            user: result.data.user,
            expiresAt: result.data.expiresAt.getTime(),
          }),
          {
            status: 201,
            headers,
          },
        );
      }

      // Route: POST /api/auth/signin
      if (method === 'POST' && path === '/signin') {
        const body = (await request.json()) as SignInInput;
        const result = await signIn(body, { headers: request.headers });

        if (!result.ok) {
          // MFA challenge: encrypt userId into challenge cookie
          if (result.error.code === 'MFA_REQUIRED' && oauthEncryptionKey) {
            const stored = await userStore.findByEmail(body.email.toLowerCase());
            if (stored) {
              const challengeData = JSON.stringify({
                userId: stored.user.id,
                expiresAt: Date.now() + 300_000, // 5 min
              });
              const encryptedChallenge = await encrypt(challengeData, oauthEncryptionKey);
              const headers = new Headers({
                'Content-Type': 'application/json',
                ...securityHeaders(),
              });
              headers.append(
                'Set-Cookie',
                buildMfaChallengeCookie(encryptedChallenge, cookieConfig),
              );
              return new Response(JSON.stringify({ error: result.error }), {
                status: 403,
                headers,
              });
            }
          }
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

        return new Response(
          JSON.stringify({
            user: result.data.user,
            expiresAt: result.data.expiresAt.getTime(),
          }),
          {
            status: 200,
            headers,
          },
        );
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

      // Route: GET /api/auth/access-set
      if (method === 'GET' && path === '/access-set') {
        if (!config.access) {
          return new Response(JSON.stringify({ error: 'Access control not configured' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const sessionResult = await getSession(request.headers);
        if (!sessionResult.ok || !sessionResult.data) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const accessSet = await computeAccessSet({
          userId: sessionResult.data.user.id,
          accessDef: config.access.definition,
          roleStore: config.access.roleStore,
          closureStore: config.access.closureStore,
          flagStore: config.access.flagStore,
          plan: sessionResult.data.user.plan ?? null,
        });

        const encoded = encodeAccessSet(accessSet);
        // Hash only the stable fields (entitlements, flags, plan) — not computedAt
        const hashPayload = {
          entitlements: encoded.entitlements,
          flags: encoded.flags,
          plan: encoded.plan,
        };
        const hash = await sha256Hex(JSON.stringify(hashPayload));

        // ETag support for 304 Not Modified (RFC 7232: ETags must be quoted)
        const quotedEtag = `"${hash}"`;
        const ifNoneMatch = request.headers.get('If-None-Match');
        if (ifNoneMatch && ifNoneMatch.replace(/"/g, '') === hash) {
          return new Response(null, {
            status: 304,
            headers: {
              ETag: quotedEtag,
              ...securityHeaders(),
              // Override no-store: allow conditional requests with ETag
              'Cache-Control': 'no-cache',
            },
          });
        }

        return new Response(JSON.stringify({ accessSet }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: quotedEtag,
            ...securityHeaders(),
            // Override no-store: allow conditional requests with ETag
            'Cache-Control': 'no-cache',
          },
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

        return new Response(
          JSON.stringify({
            user: result.data.user,
            expiresAt: result.data.expiresAt.getTime(),
          }),
          {
            status: 200,
            headers,
          },
        );
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

      // =================================================================
      // OAuth Routes
      // =================================================================

      // Route: GET /api/auth/oauth/:provider
      if (method === 'GET' && path.startsWith('/oauth/') && !path.includes('/callback')) {
        const providerId = path.replace('/oauth/', '');
        const provider = providers.get(providerId);

        if (!provider) {
          return new Response(JSON.stringify({ error: 'Provider not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        // Rate limit: 10 OAuth initiations per 5 minutes per IP
        const oauthIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'default';
        const oauthRateLimit = await rateLimitStore.check(`oauth:${oauthIp}`, 10, 5 * 60 * 1000);
        if (!oauthRateLimit.allowed) {
          return new Response(JSON.stringify({ error: 'Too many requests' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        if (!oauthEncryptionKey) {
          return new Response(JSON.stringify({ error: 'OAuth not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        const state = generateNonce();
        const nonce = generateNonce();

        const stateData: OAuthStateData = {
          provider: providerId,
          state,
          codeVerifier,
          nonce,
          expiresAt: Date.now() + 300_000, // 5 minutes
        };

        const encryptedState = await encrypt(JSON.stringify(stateData), oauthEncryptionKey);
        const authUrl = provider.getAuthorizationUrl(state, codeChallenge, nonce);

        const headers = new Headers({
          Location: authUrl,
          ...securityHeaders(),
        });
        headers.append('Set-Cookie', buildOAuthStateCookie(encryptedState, cookieConfig));

        return new Response(null, { status: 302, headers });
      }

      // Route: GET /api/auth/oauth/:provider/callback
      if (method === 'GET' && path.includes('/oauth/') && path.endsWith('/callback')) {
        const providerId = path.replace('/oauth/', '').replace('/callback', '');
        const provider = providers.get(providerId);

        const errorRedirect = oauthErrorRedirect;

        if (!provider || !oauthEncryptionKey || !oauthAccountStore) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${errorRedirect}?error=provider_not_configured`,
              ...securityHeaders(),
            },
          });
        }

        // Read and decrypt OAuth state cookie
        const oauthCookieEntry = request.headers
          .get('cookie')
          ?.split(';')
          .find((c) => c.trim().startsWith('vertz.oauth='));
        const encryptedState = oauthCookieEntry
          ? oauthCookieEntry.trim().slice('vertz.oauth='.length)
          : undefined;

        if (!encryptedState) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${errorRedirect}?error=invalid_state`,
              ...securityHeaders(),
            },
          });
        }

        const decryptedState = await decrypt(encryptedState, oauthEncryptionKey);
        if (!decryptedState) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${errorRedirect}?error=invalid_state`,
              ...securityHeaders(),
            },
          });
        }

        const stateData = JSON.parse(decryptedState) as OAuthStateData;
        const queryState = url.searchParams.get('state');
        const code = url.searchParams.get('code');

        // Handle provider-side errors (e.g., user cancelled)
        const providerError = url.searchParams.get('error');
        if (providerError) {
          const headers = new Headers({
            Location: `${errorRedirect}?error=${encodeURIComponent(providerError)}`,
            ...securityHeaders(),
          });
          headers.append('Set-Cookie', buildOAuthStateCookie('', cookieConfig, true));
          return new Response(null, { status: 302, headers });
        }

        // Validate state
        if (stateData.state !== queryState || stateData.provider !== providerId) {
          const headers = new Headers({
            Location: `${errorRedirect}?error=invalid_state`,
            ...securityHeaders(),
          });
          headers.append('Set-Cookie', buildOAuthStateCookie('', cookieConfig, true));
          return new Response(null, { status: 302, headers });
        }

        // Validate expiration
        if (stateData.expiresAt < Date.now()) {
          const headers = new Headers({
            Location: `${errorRedirect}?error=invalid_state`,
            ...securityHeaders(),
          });
          headers.append('Set-Cookie', buildOAuthStateCookie('', cookieConfig, true));
          return new Response(null, { status: 302, headers });
        }

        try {
          // Exchange code for tokens
          const tokens = await provider.exchangeCode(code ?? '', stateData.codeVerifier);

          // Get user info (pass nonce for OIDC providers to validate)
          const userInfo = await provider.getUserInfo(
            tokens.accessToken,
            tokens.idToken,
            stateData.nonce,
          );

          // Clear OAuth state cookie
          const responseHeaders = new Headers({
            Location: oauthSuccessRedirect,
            ...securityHeaders(),
          });
          responseHeaders.append('Set-Cookie', buildOAuthStateCookie('', cookieConfig, true));

          // Account linking logic
          let userId: string | null = null;

          // 1. Check existing OAuth link
          userId = await oauthAccountStore.findByProviderAccount(provider.id, userInfo.providerId);

          if (!userId) {
            // 2. Trusted provider + verified email → auto-link
            if (provider.trustEmail && userInfo.emailVerified) {
              const existingUser = await userStore.findByEmail(userInfo.email.toLowerCase());
              if (existingUser) {
                userId = existingUser.user.id;
                await oauthAccountStore.linkAccount(
                  userId,
                  provider.id,
                  userInfo.providerId,
                  userInfo.email,
                );
              }
            }

            // 3. Create new user
            if (!userId) {
              // Validate email before creating user
              if (!userInfo.email || !userInfo.email.includes('@')) {
                const headers = new Headers({
                  Location: `${errorRedirect}?error=email_required`,
                  ...securityHeaders(),
                });
                headers.append('Set-Cookie', buildOAuthStateCookie('', cookieConfig, true));
                return new Response(null, { status: 302, headers });
              }
              const now = new Date();
              const newUser: AuthUser = {
                id: crypto.randomUUID(),
                email: userInfo.email.toLowerCase(),
                role: 'user',
                createdAt: now,
                updatedAt: now,
              };
              await userStore.createUser(newUser, null);
              userId = newUser.id;
              await oauthAccountStore.linkAccount(
                userId,
                provider.id,
                userInfo.providerId,
                userInfo.email,
              );
            }
          }

          // Get user from store
          const user = await userStore.findById(userId);
          if (!user) {
            return new Response(null, {
              status: 302,
              headers: {
                Location: `${errorRedirect}?error=user_info_failed`,
                ...securityHeaders(),
              },
            });
          }

          // Create session (same flow as email/password)
          const sessionId = crypto.randomUUID();
          const sessionTokens = await createSessionTokens(user, sessionId);
          const refreshTokenHash = await sha256Hex(sessionTokens.refreshToken);

          const ipAddress =
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
            request.headers.get('x-real-ip') ??
            '';
          const userAgent = request.headers.get('user-agent') ?? '';

          await sessionStore.createSessionWithId(sessionId, {
            userId: user.id,
            refreshTokenHash,
            ipAddress,
            userAgent,
            expiresAt: new Date(Date.now() + refreshTtlMs),
            currentTokens: { jwt: sessionTokens.jwt, refreshToken: sessionTokens.refreshToken },
          });

          responseHeaders.append('Set-Cookie', buildSessionCookie(sessionTokens.jwt, cookieConfig));
          responseHeaders.append(
            'Set-Cookie',
            buildRefreshCookie(
              sessionTokens.refreshToken,
              cookieConfig,
              refreshName,
              refreshMaxAge,
            ),
          );

          return new Response(null, { status: 302, headers: responseHeaders });
        } catch {
          const headers = new Headers({
            Location: `${errorRedirect}?error=token_exchange_failed`,
            ...securityHeaders(),
          });
          headers.append('Set-Cookie', buildOAuthStateCookie('', cookieConfig, true));
          return new Response(null, { status: 302, headers });
        }
      }

      // =================================================================
      // MFA Routes
      // =================================================================

      // Route: POST /api/auth/mfa/challenge
      if (method === 'POST' && path === '/mfa/challenge') {
        if (!mfaStore || !oauthEncryptionKey) {
          return new Response(JSON.stringify({ error: 'MFA not configured' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        // Rate limit: 5 attempts per 15min per IP
        const challengeIp =
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'default';
        const challengeRateLimit = await rateLimitStore.check(
          `mfa-challenge:${challengeIp}`,
          5,
          signInWindowMs,
        );
        if (!challengeRateLimit.allowed) {
          return new Response(
            JSON.stringify({ error: createAuthRateLimitedError('Too many MFA attempts') }),
            {
              status: 429,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        // Read vertz.mfa cookie
        const mfaCookieEntry = request.headers
          .get('cookie')
          ?.split(';')
          .find((c) => c.trim().startsWith('vertz.mfa='));
        const mfaToken = mfaCookieEntry
          ? mfaCookieEntry.trim().slice('vertz.mfa='.length)
          : undefined;

        if (!mfaToken) {
          return new Response(
            JSON.stringify({
              error: { code: 'SESSION_EXPIRED', message: 'No MFA challenge token' },
            }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        // Decrypt challenge token
        const decrypted = await decrypt(mfaToken, oauthEncryptionKey);
        if (!decrypted) {
          return new Response(
            JSON.stringify({
              error: { code: 'SESSION_EXPIRED', message: 'Invalid MFA challenge token' },
            }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const challengeData = JSON.parse(decrypted) as { userId: string; expiresAt: number };

        // Check expiry
        if (challengeData.expiresAt < Date.now()) {
          return new Response(
            JSON.stringify({
              error: { code: 'SESSION_EXPIRED', message: 'MFA challenge expired' },
            }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const body = (await request.json()) as { code: string };
        const userId = challengeData.userId;

        // Get encrypted TOTP secret
        const encryptedSecret = await mfaStore.getSecret(userId);
        if (!encryptedSecret) {
          return new Response(JSON.stringify({ error: createMfaNotEnabledError() }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        // Decrypt the TOTP secret
        const totpSecret = await decrypt(encryptedSecret, oauthEncryptionKey);
        if (!totpSecret) {
          return new Response(JSON.stringify({ error: 'Internal error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        // Try TOTP verification
        let codeValid = await verifyTotpCode(totpSecret, body.code);

        // If TOTP fails, try backup codes
        if (!codeValid) {
          const hashedCodes = await mfaStore.getBackupCodes(userId);
          for (const hashed of hashedCodes) {
            if (await verifyBackupCode(body.code, hashed)) {
              await mfaStore.consumeBackupCode(userId, hashed);
              codeValid = true;
              break;
            }
          }
        }

        if (!codeValid) {
          return new Response(JSON.stringify({ error: createMfaInvalidCodeError() }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        // Create session (same dual-token flow)
        const user = await userStore.findById(userId);
        if (!user) {
          return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const sessionId = crypto.randomUUID();
        const fvaTimestamp = Math.floor(Date.now() / 1000);
        const tokens = await createSessionTokens(user, sessionId, { fva: fvaTimestamp });
        const refreshTokenHash = await sha256Hex(tokens.refreshToken);

        const ipAddress =
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
          request.headers.get('x-real-ip') ??
          '';
        const userAgent = request.headers.get('user-agent') ?? '';

        await sessionStore.createSessionWithId(sessionId, {
          userId: user.id,
          refreshTokenHash,
          ipAddress,
          userAgent,
          expiresAt: new Date(Date.now() + refreshTtlMs),
          currentTokens: { jwt: tokens.jwt, refreshToken: tokens.refreshToken },
        });

        const headers = new Headers({
          'Content-Type': 'application/json',
          ...securityHeaders(),
        });
        headers.append('Set-Cookie', buildSessionCookie(tokens.jwt, cookieConfig));
        headers.append(
          'Set-Cookie',
          buildRefreshCookie(tokens.refreshToken, cookieConfig, refreshName, refreshMaxAge),
        );
        // Clear MFA challenge cookie
        headers.append('Set-Cookie', buildMfaChallengeCookie('', cookieConfig, true));

        return new Response(JSON.stringify({ user }), {
          status: 200,
          headers,
        });
      }

      // Route: POST /api/auth/mfa/setup
      if (method === 'POST' && path === '/mfa/setup') {
        if (!mfaStore) {
          return new Response(JSON.stringify({ error: 'MFA not configured' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const sessionResult = await getSession(request.headers);
        if (!sessionResult.ok || !sessionResult.data) {
          return new Response(
            JSON.stringify({ error: { code: 'SESSION_EXPIRED', message: 'Not authenticated' } }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const userId = sessionResult.data.user.id;
        const alreadyEnabled = await mfaStore.isMfaEnabled(userId);
        if (alreadyEnabled) {
          return new Response(JSON.stringify({ error: createMfaAlreadyEnabledError() }), {
            status: 409,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const secret = generateTotpSecret();
        const uri = generateTotpUri(secret, sessionResult.data.user.email, mfaIssuer);

        // Store pending secret (not yet enabled, TTL 10min)
        pendingMfaSecrets.set(userId, { secret, createdAt: Date.now() });

        return new Response(JSON.stringify({ secret, uri }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...securityHeaders() },
        });
      }

      // Route: POST /api/auth/mfa/verify-setup
      if (method === 'POST' && path === '/mfa/verify-setup') {
        if (!mfaStore || !oauthEncryptionKey) {
          return new Response(JSON.stringify({ error: 'MFA not configured' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const sessionResult = await getSession(request.headers);
        if (!sessionResult.ok || !sessionResult.data) {
          return new Response(
            JSON.stringify({ error: { code: 'SESSION_EXPIRED', message: 'Not authenticated' } }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const userId = sessionResult.data.user.id;
        const pendingEntry = pendingMfaSecrets.get(userId);
        if (!pendingEntry || Date.now() - pendingEntry.createdAt > PENDING_MFA_TTL) {
          if (pendingEntry) pendingMfaSecrets.delete(userId); // clean expired
          return new Response(
            JSON.stringify({ error: createMfaNotEnabledError('No pending MFA setup') }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const body = (await request.json()) as { code: string };
        const valid = await verifyTotpCode(pendingEntry.secret, body.code);
        if (!valid) {
          return new Response(JSON.stringify({ error: createMfaInvalidCodeError() }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        // Encrypt and store the secret
        const encryptedSecret = await encrypt(pendingEntry.secret, oauthEncryptionKey);
        await mfaStore.enableMfa(userId, encryptedSecret);
        pendingMfaSecrets.delete(userId);

        // Generate backup codes
        const backupCodes = generateBackupCodes(mfaBackupCodeCount);
        const hashedCodes = await Promise.all(backupCodes.map((c) => hashBackupCode(c)));
        await mfaStore.setBackupCodes(userId, hashedCodes);

        return new Response(JSON.stringify({ backupCodes }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...securityHeaders() },
        });
      }

      // Route: POST /api/auth/mfa/disable
      if (method === 'POST' && path === '/mfa/disable') {
        if (!mfaStore) {
          return new Response(JSON.stringify({ error: 'MFA not configured' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const sessionResult = await getSession(request.headers);
        if (!sessionResult.ok || !sessionResult.data) {
          return new Response(
            JSON.stringify({ error: { code: 'SESSION_EXPIRED', message: 'Not authenticated' } }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const userId = sessionResult.data.user.id;
        const body = (await request.json()) as { password: string };

        // Verify password
        const stored = await userStore.findByEmail(sessionResult.data.user.email);
        if (!stored || !stored.passwordHash) {
          return new Response(JSON.stringify({ error: createInvalidCredentialsError() }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const valid = await verifyPassword(body.password, stored.passwordHash);
        if (!valid) {
          return new Response(JSON.stringify({ error: createInvalidCredentialsError() }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        await mfaStore.disableMfa(userId);

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...securityHeaders() },
        });
      }

      // Route: POST /api/auth/mfa/backup-codes
      if (method === 'POST' && path === '/mfa/backup-codes') {
        if (!mfaStore) {
          return new Response(JSON.stringify({ error: 'MFA not configured' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const sessionResult = await getSession(request.headers);
        if (!sessionResult.ok || !sessionResult.data) {
          return new Response(
            JSON.stringify({ error: { code: 'SESSION_EXPIRED', message: 'Not authenticated' } }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const body = (await request.json()) as { password: string };

        // Verify password
        const stored = await userStore.findByEmail(sessionResult.data.user.email);
        if (!stored || !stored.passwordHash) {
          return new Response(JSON.stringify({ error: createInvalidCredentialsError() }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const valid = await verifyPassword(body.password, stored.passwordHash);
        if (!valid) {
          return new Response(JSON.stringify({ error: createInvalidCredentialsError() }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const userId = sessionResult.data.user.id;
        const backupCodes = generateBackupCodes(mfaBackupCodeCount);
        const hashedCodes = await Promise.all(backupCodes.map((c) => hashBackupCode(c)));
        await mfaStore.setBackupCodes(userId, hashedCodes);

        return new Response(JSON.stringify({ backupCodes }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...securityHeaders() },
        });
      }

      // Route: GET /api/auth/mfa/status
      if (method === 'GET' && path === '/mfa/status') {
        if (!mfaStore) {
          return new Response(JSON.stringify({ error: 'MFA not configured' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const sessionResult = await getSession(request.headers);
        if (!sessionResult.ok || !sessionResult.data) {
          return new Response(
            JSON.stringify({ error: { code: 'SESSION_EXPIRED', message: 'Not authenticated' } }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const userId = sessionResult.data.user.id;
        const enabled = await mfaStore.isMfaEnabled(userId);
        const codes = await mfaStore.getBackupCodes(userId);

        return new Response(
          JSON.stringify({
            enabled,
            hasBackupCodes: codes.length > 0,
            backupCodesRemaining: codes.length,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          },
        );
      }

      // Route: POST /api/auth/mfa/step-up
      if (method === 'POST' && path === '/mfa/step-up') {
        if (!mfaStore || !oauthEncryptionKey) {
          return new Response(JSON.stringify({ error: 'MFA not configured' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        // Rate limit: 5 attempts per 15min per IP
        const stepUpIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'default';
        const stepUpRateLimit = await rateLimitStore.check(
          `mfa-stepup:${stepUpIp}`,
          5,
          signInWindowMs,
        );
        if (!stepUpRateLimit.allowed) {
          return new Response(
            JSON.stringify({ error: createAuthRateLimitedError('Too many step-up attempts') }),
            {
              status: 429,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const sessionResult = await getSession(request.headers);
        if (!sessionResult.ok || !sessionResult.data) {
          return new Response(
            JSON.stringify({ error: { code: 'SESSION_EXPIRED', message: 'Not authenticated' } }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const userId = sessionResult.data.user.id;
        const encryptedSecret = await mfaStore.getSecret(userId);
        if (!encryptedSecret) {
          return new Response(JSON.stringify({ error: createMfaNotEnabledError() }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const totpSecret = await decrypt(encryptedSecret, oauthEncryptionKey);
        if (!totpSecret) {
          return new Response(JSON.stringify({ error: 'Internal error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const body = (await request.json()) as { code: string };
        const valid = await verifyTotpCode(totpSecret, body.code);
        if (!valid) {
          return new Response(JSON.stringify({ error: createMfaInvalidCodeError() }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        // Issue new JWT with updated fva and persist to session store
        const user = sessionResult.data.user;
        const currentSid = sessionResult.data.payload.sid;
        const fvaTimestamp = Math.floor(Date.now() / 1000);
        const tokens = await createSessionTokens(user, currentSid, { fva: fvaTimestamp });
        const newRefreshHash = await sha256Hex(tokens.refreshToken);

        // Get old refresh hash so we can do proper rotation
        const oldTokens = await sessionStore.getCurrentTokens(currentSid);
        const previousRefreshHash = oldTokens
          ? await sha256Hex(oldTokens.refreshToken)
          : newRefreshHash;

        // Update stored session so fva survives token refresh
        await sessionStore.updateSession(currentSid, {
          refreshTokenHash: newRefreshHash,
          previousRefreshHash,
          lastActiveAt: new Date(),
          currentTokens: { jwt: tokens.jwt, refreshToken: tokens.refreshToken },
        });

        const headers = new Headers({
          'Content-Type': 'application/json',
          ...securityHeaders(),
        });
        headers.append('Set-Cookie', buildSessionCookie(tokens.jwt, cookieConfig));
        headers.append(
          'Set-Cookie',
          buildRefreshCookie(tokens.refreshToken, cookieConfig, refreshName, refreshMaxAge),
        );

        return new Response(JSON.stringify({ user }), {
          status: 200,
          headers,
        });
      }

      // =================================================================
      // Email Verification Routes
      // =================================================================

      // Route: POST /api/auth/verify-email
      if (method === 'POST' && path === '/verify-email') {
        if (!emailVerificationStore || !emailVerificationEnabled) {
          return new Response(
            JSON.stringify({
              error: {
                code: 'AUTH_VALIDATION_ERROR',
                message: 'Email verification not configured',
              },
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const body = (await request.json()) as { token: string };
        if (!body.token) {
          return new Response(
            JSON.stringify({ error: createTokenInvalidError('Token is required') }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const tokenHash = await sha256Hex(body.token);
        const verification = await emailVerificationStore.findByTokenHash(tokenHash);

        if (!verification) {
          return new Response(JSON.stringify({ error: createTokenInvalidError() }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        if (verification.expiresAt < new Date()) {
          await emailVerificationStore.deleteByTokenHash(tokenHash);
          return new Response(JSON.stringify({ error: createTokenExpiredError() }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        // Mark email as verified
        await userStore.updateEmailVerified(verification.userId, true);

        // Delete all verification tokens for this user
        await emailVerificationStore.deleteByUserId(verification.userId);

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...securityHeaders() },
        });
      }

      // Route: POST /api/auth/resend-verification
      if (method === 'POST' && path === '/resend-verification') {
        if (
          !emailVerificationStore ||
          !emailVerificationEnabled ||
          !emailVerificationConfig?.onSend
        ) {
          return new Response(
            JSON.stringify({
              error: {
                code: 'AUTH_VALIDATION_ERROR',
                message: 'Email verification not configured',
              },
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        // Requires authentication
        const sessionResult = await getSession(request.headers);
        if (!sessionResult.ok || !sessionResult.data) {
          return new Response(
            JSON.stringify({ error: { code: 'SESSION_EXPIRED', message: 'Not authenticated' } }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const userId = sessionResult.data.user.id;

        // Rate limit: 3 resend per hour per userId
        const resendRateLimit = await rateLimitStore.check(
          `resend-verification:${userId}`,
          3,
          parseDuration('1h'),
        );
        if (!resendRateLimit.allowed) {
          return new Response(
            JSON.stringify({ error: createAuthRateLimitedError('Too many resend attempts') }),
            {
              status: 429,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        // Delete old verification tokens
        await emailVerificationStore.deleteByUserId(userId);

        // Generate new token
        const token = generateToken();
        const tokenHash = await sha256Hex(token);
        await emailVerificationStore.createVerification({
          userId,
          tokenHash,
          expiresAt: new Date(Date.now() + emailVerificationTtlMs),
        });

        await emailVerificationConfig.onSend(sessionResult.data.user, token);

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...securityHeaders() },
        });
      }

      // =================================================================
      // Password Reset Routes
      // =================================================================

      // Route: POST /api/auth/forgot-password
      if (method === 'POST' && path === '/forgot-password') {
        if (!passwordResetStore || !passwordResetEnabled || !passwordResetConfig?.onSend) {
          return new Response(
            JSON.stringify({
              error: { code: 'AUTH_VALIDATION_ERROR', message: 'Password reset not configured' },
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const body = (await request.json()) as { email: string };

        // Rate limit: 3 per hour per email
        const forgotRateLimit = await rateLimitStore.check(
          `forgot-password:${(body.email ?? '').toLowerCase()}`,
          3,
          parseDuration('1h'),
        );
        if (!forgotRateLimit.allowed) {
          // Still return 200 to prevent email enumeration
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        // Always return 200 regardless of whether user exists
        const stored = await userStore.findByEmail((body.email ?? '').toLowerCase());
        if (stored) {
          const token = generateToken();
          const tokenHash = await sha256Hex(token);
          await passwordResetStore.createReset({
            userId: stored.user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + passwordResetTtlMs),
          });
          await passwordResetConfig.onSend(stored.user, token);
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...securityHeaders() },
        });
      }

      // Route: POST /api/auth/reset-password
      if (method === 'POST' && path === '/reset-password') {
        if (!passwordResetStore || !passwordResetEnabled) {
          return new Response(
            JSON.stringify({
              error: { code: 'AUTH_VALIDATION_ERROR', message: 'Password reset not configured' },
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        const body = (await request.json()) as { token: string; password: string };
        if (!body.token) {
          return new Response(
            JSON.stringify({ error: createTokenInvalidError('Token is required') }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...securityHeaders() },
            },
          );
        }

        // Validate new password
        const passwordError = validatePassword(body.password, emailPassword?.password);
        if (passwordError) {
          return new Response(JSON.stringify({ error: passwordError }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        const tokenHash = await sha256Hex(body.token);
        const resetRecord = await passwordResetStore.findByTokenHash(tokenHash);

        if (!resetRecord) {
          return new Response(JSON.stringify({ error: createTokenInvalidError() }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        if (resetRecord.expiresAt < new Date()) {
          await passwordResetStore.deleteByUserId(resetRecord.userId);
          return new Response(JSON.stringify({ error: createTokenExpiredError() }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...securityHeaders() },
          });
        }

        // Update password hash
        const newPasswordHash = await hashPassword(body.password);
        await userStore.updatePasswordHash(resetRecord.userId, newPasswordHash);

        // Delete all reset tokens for this user
        await passwordResetStore.deleteByUserId(resetRecord.userId);

        // Revoke all sessions (configurable, default: true)
        if (revokeSessionsOnReset) {
          const activeSessions = await sessionStore.listActiveSessions(resetRecord.userId);
          for (const s of activeSessions) {
            await sessionStore.revokeSession(s.id);
          }
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
      oauthAccountStore?.dispose();
      mfaStore?.dispose();
      emailVerificationStore?.dispose();
      passwordResetStore?.dispose();
      pendingMfaSecrets.clear();
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
export type { AccessContext, AccessContextConfig, ResourceRef } from './access-context';
// Phase 6: Resource Hierarchy & defineAccess
export { createAccessContext } from './access-context';
export type {
  AccessEvent,
  AccessEventBroadcaster,
  AccessEventBroadcasterConfig,
  AccessWsData,
} from './access-event-broadcaster';
export { createAccessEventBroadcaster } from './access-event-broadcaster';
export type {
  AccessCheckData,
  AccessSet,
  ComputeAccessSetConfig,
  EncodedAccessSet,
} from './access-set';
export { computeAccessSet, decodeAccessSet, encodeAccessSet } from './access-set';
// DB-backed auth stores
export { authModels } from './auth-models';
export { AUTH_TABLE_NAMES, initializeAuthTables, validateAuthModels } from './auth-tables';
export type { Period } from './billing-period';
export { calculateBillingPeriod } from './billing-period';
export type { ClosureEntry, ClosureRow, ClosureStore, ParentRef } from './closure-store';
export { InMemoryClosureStore } from './closure-store';
export { DbClosureStore } from './db-closure-store';
export { DbFlagStore } from './db-flag-store';
export { DbOAuthAccountStore } from './db-oauth-account-store';
export { DbPlanStore } from './db-plan-store';
export { DbRoleAssignmentStore } from './db-role-assignment-store';
export { DbSessionStore } from './db-session-store';
export type { AuthDbClient } from './db-types';
export { DbUserStore } from './db-user-store';
export type {
  AccessCheckResult,
  AccessDefinition,
  BillingPeriod,
  DefineAccessInput,
  DenialMeta,
  DenialReason,
  EntitlementDef,
  EntitlementValue,
  EntityDef,
  GraceDuration,
  GrandfatheringPolicy,
  LimitDef,
  PlanDef,
  PlanPrice,
  PriceInterval,
  RuleContext,
} from './define-access';
export { defineAccess } from './define-access';
export type { DbDialectName } from './dialect-ddl';
export { InMemoryEmailVerificationStore } from './email-verification-store';
export { computeEntityAccess } from './entity-access';
export type { FlagStore } from './flag-store';
export { InMemoryFlagStore } from './flag-store';
export { checkFva } from './fva';
export type { GrandfatheringState, GrandfatheringStore } from './grandfathering-store';
export { InMemoryGrandfatheringStore } from './grandfathering-store';
export { InMemoryMFAStore } from './mfa-store';
export { InMemoryOAuthAccountStore } from './oauth-account-store';
export { InMemoryPasswordResetStore } from './password-reset-store';
// Phase 4: Plan Versioning & Grandfathering
export type { PlanHashInput } from './plan-hash';
export { computePlanHash } from './plan-hash';
export type {
  MigrateOpts,
  PlanEvent,
  PlanEventHandler,
  PlanEventType,
  PlanManager,
  PlanManagerConfig,
  ScheduleOpts,
  TenantPlanState,
} from './plan-manager';
export { createPlanManager } from './plan-manager';
// Phase 8: Plans & Wallet
export type { LimitOverride, OrgPlan, PlanStore } from './plan-store';
export { InMemoryPlanStore, resolveEffectivePlan } from './plan-store';
export type { PlanSnapshot, PlanVersionInfo, PlanVersionStore } from './plan-version-store';
export { InMemoryPlanVersionStore } from './plan-version-store';
// Billing
export type { BillingAdapter } from './billing/adapter';
export type {
  BillingEvent,
  BillingEventEmitter,
  BillingEventHandler,
  BillingEventType,
} from './billing/event-emitter';
export { createBillingEventEmitter } from './billing/event-emitter';
export type { OverageInput } from './billing/overage';
export { computeOverage } from './billing/overage';
export type {
  StripeClient,
  StripeBillingAdapterConfig,
  StripePrice,
  StripeProduct,
} from './billing/stripe-adapter';
export { createStripeBillingAdapter } from './billing/stripe-adapter';
export type { WebhookHandlerConfig } from './billing/webhook-handler';
export { createWebhookHandler } from './billing/webhook-handler';
// Re-export provider factories
export { discord, github, google } from './providers';
export { InMemoryRateLimitStore } from './rate-limit-store';
export type { RoleAssignment, RoleAssignmentStore } from './role-assignment-store';
export { InMemoryRoleAssignmentStore } from './role-assignment-store';
export type {
  AccessRule,
  AllRule,
  AnyRule,
  AuthenticatedRule,
  EntitlementRule,
  FvaRule,
  RoleRule,
  UserMarker,
  WhereRule,
} from './rules';
export { rules } from './rules';
// Re-export store implementations
export { InMemorySessionStore } from './session-store';
// Re-export types from types.ts
export type {
  AclClaim,
  AuthAccessConfig,
  AuthApi,
  AuthConfig,
  AuthContext,
  AuthInstance,
  AuthTokens,
  AuthUser,
  CookieConfig,
  EmailPasswordConfig,
  EmailVerificationConfig,
  EmailVerificationStore,
  MFAStore,
  MfaChallengeData,
  MfaConfig,
  MfaSetupData,
  OAuthAccountStore,
  OAuthProvider,
  OAuthProviderConfig,
  OAuthTokens,
  OAuthUserInfo,
  PasswordRequirements,
  PasswordResetConfig,
  PasswordResetStore,
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
  StoredEmailVerification,
  StoredPasswordReset,
  StoredSession,
  UserStore,
  UserTableEntry,
} from './types';
export { InMemoryUserStore } from './user-store';
export type { ConsumeResult, WalletEntry, WalletStore } from './wallet-store';
export { InMemoryWalletStore } from './wallet-store';
