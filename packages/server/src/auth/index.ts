/**
 * Auth Module Implementation - Phase 1
 * JWT sessions, email/password authentication
 */

import {
  type AuthError,
  type AuthValidationError,
  createAuthRateLimitedError,
  createAuthValidationError,
  createInvalidCredentialsError,
  createSessionExpiredError,
  createUserExistsError,
  err,
  ok,
  type Result,
} from '@vertz/errors';
import bcrypt from 'bcryptjs';
import * as jose from 'jose';
import type {
  AuthApi,
  AuthConfig,
  AuthInstance,
  AuthUser,
  CookieConfig,
  PasswordRequirements,
  RateLimitResult,
  Session,
  SessionPayload,
  SignInInput,
  SignUpInput,
} from './types';

// ============================================================================
// Rate Limiter (in-memory for Phase 1)
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: Date;
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private windowMs: number;

  constructor(window: string) {
    this.windowMs = this.parseDuration(window);
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smh])$/);
    if (!match) throw new Error(`Invalid duration: ${duration}`);
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000 };
    return value * multipliers[unit];
  }

  check(key: string, maxAttempts: number): RateLimitResult {
    const now = new Date();
    const entry = this.store.get(key);

    if (!entry || entry.resetAt < now) {
      // New window
      const resetAt = new Date(now.getTime() + this.windowMs);
      this.store.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: maxAttempts - 1, resetAt };
    }

    if (entry.count >= maxAttempts) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count++;
    return { allowed: true, remaining: maxAttempts - entry.count, resetAt: entry.resetAt };
  }

  // Cleanup old entries periodically
  cleanup(): void {
    const now = new Date();
    for (const [key, entry] of this.store) {
      if (entry.resetAt < now) {
        this.store.delete(key);
      }
    }
  }
}

// ============================================================================
// Password Utilities
// ============================================================================

const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirements = {
  minLength: 8,
  requireUppercase: false,
  requireNumbers: false,
  requireSymbols: false,
};

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validatePassword(
  password: string,
  requirements?: PasswordRequirements,
): AuthValidationError | null {
  const req = { ...DEFAULT_PASSWORD_REQUIREMENTS, ...requirements };

  if (password.length < (req.minLength ?? 8)) {
    return createAuthValidationError(
      `Password must be at least ${req.minLength} characters`,
      'password',
      'TOO_SHORT',
    );
  }

  if (req.requireUppercase && !/[A-Z]/.test(password)) {
    return createAuthValidationError(
      'Password must contain at least one uppercase letter',
      'password',
      'NO_UPPERCASE',
    );
  }

  if (req.requireNumbers && !/\d/.test(password)) {
    return createAuthValidationError(
      'Password must contain at least one number',
      'password',
      'NO_NUMBER',
    );
  }

  if (req.requireSymbols && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return createAuthValidationError(
      'Password must contain at least one symbol',
      'password',
      'NO_SYMBOL',
    );
  }

  return null;
}

// ============================================================================
// JWT Utilities
// ============================================================================

const DEFAULT_COOKIE_CONFIG: CookieConfig = {
  name: 'vertz.sid',
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

function parseDuration(duration: string | number): number {
  if (typeof duration === 'number') return duration;

  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit] * 1000;
}

async function createJWT(
  user: AuthUser,
  secret: string,
  ttl: number,
  algorithm: string,
  customClaims?: (user: AuthUser) => Record<string, unknown>,
): Promise<string> {
  const claims = customClaims ? customClaims(user) : {};

  const jwt = await new jose.SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    ...claims,
  })
    .setProtectedHeader({ alg: algorithm })
    .setIssuedAt()
    .setExpirationTime(Math.floor(ttl / 1000))
    .sign(new TextEncoder().encode(secret));

  return jwt;
}

async function verifyJWT(
  token: string,
  secret: string,
  algorithm: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: [algorithm],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ============================================================================
// Auth Instance
// ============================================================================

// In-memory user store for Phase 1 (will be replaced with DB in future)
const users = new Map<string, { user: AuthUser; passwordHash: string }>();

// In-memory sessions (for refresh - JWT is stateless)
const sessions = new Map<string, { userId: string; expiresAt: Date }>();

export function createAuth(config: AuthConfig): AuthInstance {
  const {
    session,
    emailPassword,
    jwtSecret: configJwtSecret,
    jwtAlgorithm = 'HS256',
    claims,
  } = config;

  // Determine production mode: explicit config > process.env > secure default (true)
  // When process is unavailable (edge runtimes) or NODE_ENV is unset, default to production (secure).
  // Only explicit NODE_ENV=development opts into insecure defaults.
  const isProduction =
    config.isProduction ??
    (typeof process === 'undefined' || process.env.NODE_ENV !== 'development');

  // Validate JWT secret - throw in production, warn in development
  let jwtSecret: string;

  if (configJwtSecret) {
    jwtSecret = configJwtSecret;
  } else if (isProduction) {
    throw new Error(
      'jwtSecret is required in production. Provide it via createAuth({ jwtSecret: "..." }).',
    );
  } else {
    console.warn(
      'Using insecure default JWT secret. Provide jwtSecret in createAuth() config for production.',
    );
    jwtSecret = 'dev-secret-change-in-production';
  }

  const cookieConfig = { ...DEFAULT_COOKIE_CONFIG, ...session.cookie };
  const ttlMs = parseDuration(session.ttl);

  // Rate limiters
  const signInLimiter = new RateLimiter(emailPassword?.rateLimit?.window || '15m');
  const signUpLimiter = new RateLimiter('1h');
  const refreshLimiter = new RateLimiter('1m');

  // Cleanup rate limiters periodically
  setInterval(() => {
    signInLimiter.cleanup();
    signUpLimiter.cleanup();
    refreshLimiter.cleanup();
  }, 60000);

  // ==========================================================================
  // Helper: Build user from stored data
  // ==========================================================================

  function buildAuthUser(stored: { user: AuthUser; passwordHash: string }): AuthUser {
    return stored.user;
  }

  // ==========================================================================
  // API: Sign Up
  // ==========================================================================

  async function signUp(data: SignUpInput): Promise<Result<Session, AuthError>> {
    const { email, password, role = 'user', ...additionalFields } = data;

    // Check email format
    if (!email || !email.includes('@')) {
      return err(createAuthValidationError('Invalid email format', 'email', 'INVALID_FORMAT'));
    }

    // Check password requirements
    const passwordError = validatePassword(password, emailPassword?.password);
    if (passwordError) {
      return err(passwordError);
    }

    // Check if user exists
    if (users.has(email.toLowerCase())) {
      return err(createUserExistsError('User already exists', email.toLowerCase()));
    }

    // Rate limit on sign up
    const signUpRateLimit = signUpLimiter.check(
      `signup:${email.toLowerCase()}`,
      emailPassword?.rateLimit?.maxAttempts || 3,
    );
    if (!signUpRateLimit.allowed) {
      return err(createAuthRateLimitedError('Too many sign up attempts'));
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const now = new Date();
    const user: AuthUser = {
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      role,
      createdAt: now,
      updatedAt: now,
      ...additionalFields,
    };

    users.set(email.toLowerCase(), { user, passwordHash });

    // Create session
    const token = await createJWT(user, jwtSecret, ttlMs, jwtAlgorithm, claims);
    const expiresAt = new Date(Date.now() + ttlMs);

    const payload: SessionPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      claims: claims ? claims(user) : undefined,
    };

    sessions.set(token, { userId: user.id, expiresAt });

    return ok({ user, expiresAt, payload });
  }

  // ==========================================================================
  // API: Sign In
  // ==========================================================================

  async function signIn(data: SignInInput): Promise<Result<Session, AuthError>> {
    const { email, password } = data;

    // Check if user exists
    const stored = users.get(email.toLowerCase());
    if (!stored) {
      return err(createInvalidCredentialsError());
    }

    // Rate limit on sign in
    const signInRateLimit = signInLimiter.check(
      `signin:${email.toLowerCase()}`,
      emailPassword?.rateLimit?.maxAttempts || 5,
    );
    if (!signInRateLimit.allowed) {
      return err(createAuthRateLimitedError('Too many sign in attempts'));
    }

    // Verify password
    const valid = await verifyPassword(password, stored.passwordHash);
    if (!valid) {
      return err(createInvalidCredentialsError());
    }

    const user = buildAuthUser(stored);

    // Create session
    const token = await createJWT(user, jwtSecret, ttlMs, jwtAlgorithm, claims);
    const expiresAt = new Date(Date.now() + ttlMs);

    const payload: SessionPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      claims: claims ? claims(user) : undefined,
    };

    sessions.set(token, { userId: user.id, expiresAt });

    return ok({ user, expiresAt, payload });
  }

  // ==========================================================================
  // API: Sign Out
  // ==========================================================================

  async function signOut(ctx: { headers: Headers }): Promise<Result<void, AuthError>> {
    const cookieName = cookieConfig.name || 'vertz.sid';
    const token = ctx.headers
      .get('cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith(`${cookieName}=`))
      ?.split('=')[1];

    if (token) {
      sessions.delete(token);
    }

    return ok(undefined);
  }

  // ==========================================================================
  // API: Get Session
  // ==========================================================================

  async function getSession(headers: Headers): Promise<Result<Session | null, AuthError>> {
    const cookieName = cookieConfig.name || 'vertz.sid';
    const token = headers
      .get('cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith(`${cookieName}=`))
      ?.split('=')[1];

    if (!token) {
      return ok(null);
    }

    // Check session exists
    const session = sessions.get(token);
    if (!session) {
      return ok(null);
    }

    // Check if expired
    if (session.expiresAt < new Date()) {
      sessions.delete(token);
      return ok(null);
    }

    // Verify JWT
    const payload = await verifyJWT(token, jwtSecret, jwtAlgorithm);
    if (!payload) {
      sessions.delete(token);
      return ok(null);
    }

    // Get user
    const stored = users.get(payload.email);
    if (!stored) {
      return ok(null);
    }

    const user = buildAuthUser(stored);
    const expiresAt = new Date(payload.exp * 1000);

    return ok({ user, expiresAt, payload });
  }

  // ==========================================================================
  // API: Refresh Session
  // ==========================================================================

  async function refreshSession(ctx: { headers: Headers }): Promise<Result<Session, AuthError>> {
    // Rate limit
    const refreshRateLimit = refreshLimiter.check(
      `refresh:${ctx.headers.get('x-forwarded-ip') || 'default'}`,
      10,
    );
    if (!refreshRateLimit.allowed) {
      return err(createAuthRateLimitedError('Too many refresh attempts'));
    }

    const sessionResult = await getSession(ctx.headers);
    if (!sessionResult.ok) {
      return sessionResult;
    }

    if (!sessionResult.data) {
      return err(createSessionExpiredError('No active session'));
    }

    const user = sessionResult.data.user;

    // Create new token
    const token = await createJWT(user, jwtSecret, ttlMs, jwtAlgorithm, claims);
    const expiresAt = new Date(Date.now() + ttlMs);

    const payload: SessionPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      claims: claims ? claims(user) : undefined,
    };

    sessions.set(token, { userId: user.id, expiresAt });

    return ok({ user, expiresAt, payload });
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

  async function handleAuthRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/auth', '') || '/';
    const method = request.method;

    // CSRF check for state-changing methods
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const origin = request.headers.get('origin');
      const referer = request.headers.get('referer');

      // In production, you'd validate these properly
      // For Phase 1, we do a basic check
      if (!origin && !referer) {
        // Could be a CSRF attempt - but allow in development
        if (isProduction) {
          return new Response(JSON.stringify({ error: 'CSRF validation failed' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }

    try {
      // Route: POST /api/auth/signup
      if (method === 'POST' && path === '/signup') {
        const body = (await request.json()) as SignUpInput;
        const result = await signUp(body);

        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: authErrorToStatus(result.error),
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const cookieValue = await createJWT(
          result.data.user,
          jwtSecret,
          ttlMs,
          jwtAlgorithm,
          claims,
        );
        return new Response(JSON.stringify({ user: result.data.user }), {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': buildCookie(cookieValue),
          },
        });
      }

      // Route: POST /api/auth/signin
      if (method === 'POST' && path === '/signin') {
        const body = (await request.json()) as SignInInput;
        const result = await signIn(body);

        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: authErrorToStatus(result.error),
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const cookieValue = await createJWT(
          result.data.user,
          jwtSecret,
          ttlMs,
          jwtAlgorithm,
          claims,
        );
        return new Response(JSON.stringify({ user: result.data.user }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': buildCookie(cookieValue),
          },
        });
      }

      // Route: POST /api/auth/signout
      if (method === 'POST' && path === '/signout') {
        await signOut({ headers: request.headers });

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': buildCookie('', true),
          },
        });
      }

      // Route: GET /api/auth/session
      if (method === 'GET' && path === '/session') {
        const result = await getSession(request.headers);

        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ session: result.data }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Route: POST /api/auth/refresh
      if (method === 'POST' && path === '/refresh') {
        const result = await refreshSession({ headers: request.headers });

        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: authErrorToStatus(result.error),
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const cookieValue = await createJWT(
          result.data.user,
          jwtSecret,
          ttlMs,
          jwtAlgorithm,
          claims,
        );
        return new Response(JSON.stringify({ user: result.data.user }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': buildCookie(cookieValue),
          },
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

  function buildCookie(value: string, clear = false): string {
    const name = cookieConfig.name || 'vertz.sid';
    const maxAge = cookieConfig.maxAge ?? 60 * 60 * 24 * 7;
    const path = cookieConfig.path || '/';
    const sameSite = cookieConfig.sameSite || 'lax';
    const secure = cookieConfig.secure ?? true;

    if (clear) {
      return `${name}=; Path=${path}; HttpOnly; SameSite=${sameSite}; Max-Age=0`;
    }

    return `${name}=${value}; Path=${path}; HttpOnly${secure ? '; Secure' : ''}; SameSite=${sameSite}; Max-Age=${maxAge}`;
  }

  // ==========================================================================
  // Middleware
  // ==========================================================================

  function createMiddleware() {
    return async (ctx: any, next: () => Promise<void>) => {
      const sessionResult = await getSession(ctx.headers);

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
    // Phase 1: In-memory store, no initialization needed
    // Future: Create tables, run migrations
    console.log('[Auth] Initialized with JWT strategy');
  }

  // Return the auth instance
  const api: AuthApi = {
    signUp,
    signIn,
    signOut,
    getSession,
    refreshSession,
  };

  return {
    handler: handleAuthRequest,
    api,
    middleware: createMiddleware,
    initialize,
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

// Re-export types from types.ts
export type {
  AuthApi,
  AuthConfig,
  AuthContext,
  AuthInstance,
  AuthUser,
  CookieConfig,
  EmailPasswordConfig,
  PasswordRequirements,
  RateLimitConfig,
  RateLimitResult,
  RoleAssignmentTableEntry,
  Session,
  SessionConfig,
  SessionPayload,
  SessionStrategy,
  SignInInput,
  SignUpInput,
  UserTableEntry,
} from './types';
