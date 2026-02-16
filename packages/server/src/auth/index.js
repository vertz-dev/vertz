/**
 * Auth Module Implementation - Phase 1
 * JWT sessions, email/password authentication
 */

import bcrypt from 'bcryptjs';
import * as jose from 'jose';

class RateLimiter {
  store = new Map();
  windowMs;
  constructor(window) {
    this.windowMs = this.parseDuration(window);
  }
  parseDuration(duration) {
    const match = duration.match(/^(\d+)([smh])$/);
    if (!match) throw new Error(`Invalid duration: ${duration}`);
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers = { s: 1000, m: 60000, h: 3600000 };
    return value * multipliers[unit];
  }
  check(key, maxAttempts) {
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
  cleanup() {
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
const DEFAULT_PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: false,
  requireNumbers: false,
  requireSymbols: false,
};
const BCRYPT_ROUNDS = 12;
export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}
export function validatePassword(password, requirements) {
  const req = { ...DEFAULT_PASSWORD_REQUIREMENTS, ...requirements };
  if (password.length < (req.minLength ?? 8)) {
    return {
      code: 'PASSWORD_TOO_SHORT',
      message: `Password must be at least ${req.minLength} characters`,
      status: 400,
    };
  }
  if (req.requireUppercase && !/[A-Z]/.test(password)) {
    return {
      code: 'PASSWORD_NO_UPPERCASE',
      message: 'Password must contain at least one uppercase letter',
      status: 400,
    };
  }
  if (req.requireNumbers && !/\d/.test(password)) {
    return {
      code: 'PASSWORD_NO_NUMBER',
      message: 'Password must contain at least one number',
      status: 400,
    };
  }
  if (req.requireSymbols && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return {
      code: 'PASSWORD_NO_SYMBOL',
      message: 'Password must contain at least one symbol',
      status: 400,
    };
  }
  return null;
}
// ============================================================================
// JWT Utilities
// ============================================================================
const DEFAULT_COOKIE_CONFIG = {
  name: 'vertz.sid',
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};
function parseDuration(duration) {
  if (typeof duration === 'number') return duration;
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit] * 1000;
}
async function createJWT(user, secret, ttl, algorithm, customClaims) {
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
async function verifyJWT(token, secret, algorithm) {
  try {
    const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: [algorithm],
    });
    return payload;
  } catch {
    return null;
  }
}
// ============================================================================
// Auth Instance
// ============================================================================
// In-memory user store for Phase 1 (will be replaced with DB in future)
const users = new Map();
// In-memory sessions (for refresh - JWT is stateless)
const sessions = new Map();
export function createAuth(config) {
  const {
    session,
    emailPassword,
    jwtSecret: configJwtSecret,
    jwtAlgorithm = 'HS256',
    claims,
  } = config;
  // Validate JWT secret - throw in production, warn in development
  const envJwtSecret = process.env.AUTH_JWT_SECRET;
  let jwtSecret;
  if (configJwtSecret) {
    jwtSecret = configJwtSecret;
  } else if (envJwtSecret) {
    jwtSecret = envJwtSecret;
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'AUTH_JWT_SECRET is required in production. Provide a secret via createAuth({ session: { secret: "..." } }) or set the AUTH_JWT_SECRET environment variable.',
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn('⚠️ Using insecure default JWT secret. Set AUTH_JWT_SECRET for production.');
      jwtSecret = 'dev-secret-change-in-production';
    }
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
  function buildAuthUser(stored) {
    return stored.user;
  }
  // ==========================================================================
  // API: Sign Up
  // ==========================================================================
  async function signUp(data) {
    const { email, password, role = 'user', ...additionalFields } = data;
    // Check email format
    if (!email || !email.includes('@')) {
      return {
        ok: false,
        error: { code: 'INVALID_EMAIL', message: 'Invalid email format', status: 400 },
      };
    }
    // Check password requirements
    const passwordError = validatePassword(password, emailPassword?.password);
    if (passwordError) {
      return { ok: false, error: passwordError };
    }
    // Check if user exists
    if (users.has(email.toLowerCase())) {
      return {
        ok: false,
        error: { code: 'USER_EXISTS', message: 'User already exists', status: 409 },
      };
    }
    // Rate limit on sign up
    const signUpRateLimit = signUpLimiter.check(
      `signup:${email.toLowerCase()}`,
      emailPassword?.rateLimit?.maxAttempts || 3,
    );
    if (!signUpRateLimit.allowed) {
      return {
        ok: false,
        error: { code: 'RATE_LIMITED', message: 'Too many sign up attempts', status: 429 },
      };
    }
    // Hash password
    const passwordHash = await hashPassword(password);
    // Create user
    const now = new Date();
    const user = {
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
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      claims: claims ? claims(user) : undefined,
    };
    sessions.set(token, { userId: user.id, expiresAt });
    return {
      ok: true,
      data: { user, expiresAt, payload },
    };
  }
  // ==========================================================================
  // API: Sign In
  // ==========================================================================
  async function signIn(data) {
    const { email, password } = data;
    // Check if user exists
    const stored = users.get(email.toLowerCase());
    if (!stored) {
      return {
        ok: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password', status: 401 },
      };
    }
    // Rate limit on sign in
    const signInRateLimit = signInLimiter.check(
      `signin:${email.toLowerCase()}`,
      emailPassword?.rateLimit?.maxAttempts || 5,
    );
    if (!signInRateLimit.allowed) {
      return {
        ok: false,
        error: { code: 'RATE_LIMITED', message: 'Too many sign in attempts', status: 429 },
      };
    }
    // Verify password
    const valid = await verifyPassword(password, stored.passwordHash);
    if (!valid) {
      return {
        ok: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password', status: 401 },
      };
    }
    const user = buildAuthUser(stored);
    // Create session
    const token = await createJWT(user, jwtSecret, ttlMs, jwtAlgorithm, claims);
    const expiresAt = new Date(Date.now() + ttlMs);
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      claims: claims ? claims(user) : undefined,
    };
    sessions.set(token, { userId: user.id, expiresAt });
    return {
      ok: true,
      data: { user, expiresAt, payload },
    };
  }
  // ==========================================================================
  // API: Sign Out
  // ==========================================================================
  async function signOut(ctx) {
    const cookieName = cookieConfig.name || 'vertz.sid';
    const token = ctx.headers
      .get('cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith(`${cookieName}=`))
      ?.split('=')[1];
    if (token) {
      sessions.delete(token);
    }
    return { ok: true, data: undefined };
  }
  // ==========================================================================
  // API: Get Session
  // ==========================================================================
  async function getSession(headers) {
    const cookieName = cookieConfig.name || 'vertz.sid';
    const token = headers
      .get('cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith(`${cookieName}=`))
      ?.split('=')[1];
    if (!token) {
      return { ok: true, data: null };
    }
    // Check session exists
    const session = sessions.get(token);
    if (!session) {
      return { ok: true, data: null };
    }
    // Check if expired
    if (session.expiresAt < new Date()) {
      sessions.delete(token);
      return { ok: true, data: null };
    }
    // Verify JWT
    const payload = await verifyJWT(token, jwtSecret, jwtAlgorithm);
    if (!payload) {
      sessions.delete(token);
      return { ok: true, data: null };
    }
    // Get user
    const stored = users.get(payload.email);
    if (!stored) {
      return { ok: true, data: null };
    }
    const user = buildAuthUser(stored);
    const expiresAt = new Date(payload.exp * 1000);
    return {
      ok: true,
      data: { user, expiresAt, payload },
    };
  }
  // ==========================================================================
  // API: Refresh Session
  // ==========================================================================
  async function refreshSession(ctx) {
    // Rate limit
    const refreshRateLimit = refreshLimiter.check(
      `refresh:${ctx.headers.get('x-forwarded-ip') || 'default'}`,
      10,
    );
    if (!refreshRateLimit.allowed) {
      return {
        ok: false,
        error: { code: 'RATE_LIMITED', message: 'Too many refresh attempts', status: 429 },
      };
    }
    const sessionResult = await getSession(ctx.headers);
    if (!sessionResult.ok) {
      return sessionResult;
    }
    if (!sessionResult.data) {
      return {
        ok: false,
        error: { code: 'NO_SESSION', message: 'No active session', status: 401 },
      };
    }
    const user = sessionResult.data.user;
    // Create new token
    const token = await createJWT(user, jwtSecret, ttlMs, jwtAlgorithm, claims);
    const expiresAt = new Date(Date.now() + ttlMs);
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      claims: claims ? claims(user) : undefined,
    };
    sessions.set(token, { userId: user.id, expiresAt });
    return {
      ok: true,
      data: { user, expiresAt, payload },
    };
  }
  // ==========================================================================
  // HTTP Handler
  // ==========================================================================
  async function handleAuthRequest(request) {
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
        if (process.env.NODE_ENV === 'production') {
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
        const body = await request.json();
        const result = await signUp(body);
        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: result.error.status,
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
        const body = await request.json();
        const result = await signIn(body);
        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: result.error.status,
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
            status: result.error.status,
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
  function buildCookie(value, clear = false) {
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
    return async (ctx, next) => {
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
  async function initialize() {
    // Phase 1: In-memory store, no initialization needed
    // Future: Create tables, run migrations
    console.log('[Auth] Initialized with JWT strategy');
  }
  // Return the auth instance
  const api = {
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
// Re-export access control from auth/access.ts
export { AuthorizationError, createAccess, defaultAccess } from './access';
//# sourceMappingURL=index.js.map
