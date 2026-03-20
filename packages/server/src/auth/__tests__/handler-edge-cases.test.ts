import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { encrypt } from '../crypto';
import { createAuth } from '../index';
import type {
  AuthInstance,
  CodeInput,
  ForgotPasswordInput,
  PasswordInput,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
  TokenInput,
} from '../types';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

/**
 * Tests for HTTP handler edge cases — error paths, 404 routes, middleware,
 * and auth error status mapping that other test files don't exercise.
 */

function createTestAuth() {
  const auth = createAuth({
    session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
    emailPassword: { enabled: true },
    privateKey: TEST_PRIVATE_KEY,
    publicKey: TEST_PUBLIC_KEY,
    isProduction: false,
  });
  return auth;
}

function createTestAuthWithEmailVerification() {
  const sentEmails: { email: string; token: string }[] = [];
  const auth = createAuth({
    session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
    emailPassword: { enabled: true },
    privateKey: TEST_PRIVATE_KEY,
    publicKey: TEST_PUBLIC_KEY,
    isProduction: false,
    emailVerification: {
      enabled: true,
      tokenTtl: '24h',
      onSend: async (user: { email: string }, token: string) => {
        sentEmails.push({ email: user.email, token });
      },
    },
    passwordReset: {
      enabled: true,
      tokenTtl: '1h',
      onSend: async (user: { email: string }, token: string) => {
        sentEmails.push({ email: user.email, token });
      },
    },
  });
  return { auth, sentEmails };
}

type AuthJsonRequestBodyByPath = {
  '/forgot-password': ForgotPasswordInput;
  '/mfa/backup-codes': PasswordInput;
  '/mfa/challenge': CodeInput;
  '/mfa/disable': PasswordInput;
  '/mfa/setup': Record<string, never>;
  '/mfa/step-up': CodeInput;
  '/mfa/verify-setup': CodeInput;
  '/nonexistent': Record<string, never>;
  '/refresh': Record<string, never>;
  '/resend-verification': Record<string, never>;
  '/reset-password': Partial<ResetPasswordInput> & Record<string, unknown>;
  '/signin': SignInInput;
  '/signout': Record<string, never>;
  '/signup': SignUpInput;
  '/verify-email': Partial<TokenInput> & Record<string, unknown>;
};

function makeRequest(method: 'GET', path: string, body?: undefined, cookies?: string): Request;
function makeRequest(method: 'DELETE', path: string, body?: undefined, cookies?: string): Request;
function makeRequest<TPath extends keyof AuthJsonRequestBodyByPath>(
  method: 'POST',
  path: TPath,
  body: AuthJsonRequestBodyByPath[TPath],
  cookies?: string,
): Request;
function makeRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  cookies = '',
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: 'http://localhost',
    'X-VTZ-Request': '1',
  };
  if (cookies) {
    headers.Cookie = cookies;
  }
  return new Request(`http://localhost/api/auth${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function signUp(auth: AuthInstance, email = 'user@example.com', password = 'Password123!') {
  return auth.handler(makeRequest('POST', '/signup', { email, password }));
}

async function signIn(auth: AuthInstance, email = 'user@example.com', password = 'Password123!') {
  return auth.handler(makeRequest('POST', '/signin', { email, password }));
}

function getCookies(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

describe('Handler Edge Cases', () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createTestAuth();
  });

  afterEach(() => {
    auth.dispose();
  });

  // =========================================================================
  // 404 — Unknown routes
  // =========================================================================

  it('returns 404 for unknown route', async () => {
    const res = await auth.handler(makeRequest('GET', '/nonexistent'));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Not found');
  });

  it('returns 404 for unknown POST route', async () => {
    const res = await auth.handler(makeRequest('POST', '/nonexistent', {}));
    expect(res.status).toBe(404);
  });

  // =========================================================================
  // Signup error paths
  // =========================================================================

  it('signup returns 400 for invalid email', async () => {
    const res = await auth.handler(
      makeRequest('POST', '/signup', {
        email: 'not-an-email',
        password: 'Password123!',
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('AUTH_VALIDATION_ERROR');
  });

  it('signup returns 400 for weak password', async () => {
    const res = await auth.handler(
      makeRequest('POST', '/signup', {
        email: 'user@example.com',
        password: 'short',
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('AUTH_VALIDATION_ERROR');
  });

  it('signup returns 409 for existing user', async () => {
    await signUp(auth);
    const res = await signUp(auth);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error.code).toBe('USER_EXISTS');
  });

  it('signup strips reserved privilege fields from public input', async () => {
    const res = await auth.handler(
      makeRequest('POST', '/signup', {
        email: 'reserved@example.com',
        password: 'Password123!',
        role: 'admin',
        emailVerified: true,
      }),
    );
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.user.role).toBe('user');
    expect(data.user.emailVerified).toBe(true);
  });

  it('signup rate limits after repeated attempts', async () => {
    for (let i = 0; i < 3; i++) {
      await auth.handler(
        makeRequest('POST', '/signup', {
          email: 'same@example.com',
          password: 'Password123!',
        }),
      );
    }
    const res = await auth.handler(
      makeRequest('POST', '/signup', {
        email: 'same@example.com',
        password: 'Password123!',
      }),
    );
    expect(res.status).toBe(429);
  });

  it('signup rejects oversized JSON bodies', async () => {
    const oversizedPassword = 'P'.repeat(11 * 1024 * 1024);
    const res = await auth.handler(
      makeRequest('POST', '/signup', {
        email: 'large@example.com',
        password: oversizedPassword,
      }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('AUTH_VALIDATION_ERROR');
    expect(data.error.message).toBe('Request body too large');
  });

  // =========================================================================
  // Session management error paths
  // =========================================================================

  it('GET /session returns session data for authenticated user', async () => {
    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);
    const res = await auth.handler(makeRequest('GET', '/session', undefined, cookies));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session).toBeDefined();
  });

  it('GET /sessions returns active sessions for authenticated user', async () => {
    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);
    const res = await auth.handler(
      new Request('http://localhost/api/auth/sessions', {
        method: 'GET',
        headers: {
          Origin: 'http://localhost',
          'X-VTZ-Request': '1',
          Cookie: cookies,
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessions).toBeDefined();
  });

  it('DELETE /sessions revokes all sessions', async () => {
    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);
    const res = await auth.handler(
      new Request('http://localhost/api/auth/sessions', {
        method: 'DELETE',
        headers: {
          Origin: 'http://localhost',
          'X-VTZ-Request': '1',
          Cookie: cookies,
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('DELETE /sessions/:id revokes a specific session', async () => {
    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);

    // Get active sessions to find the session ID
    const sessionsRes = await auth.handler(
      new Request('http://localhost/api/auth/sessions', {
        method: 'GET',
        headers: {
          Origin: 'http://localhost',
          'X-VTZ-Request': '1',
          Cookie: cookies,
        },
      }),
    );
    const sessionsData = await sessionsRes.json();
    const sessionId = sessionsData.sessions[0]?.id;
    expect(sessionId).toBeDefined();

    const res = await auth.handler(
      new Request(`http://localhost/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          Origin: 'http://localhost',
          'X-VTZ-Request': '1',
          Cookie: cookies,
        },
      }),
    );
    expect(res.status).toBe(200);
  });

  // =========================================================================
  // Signout
  // =========================================================================

  it('POST /signout clears session cookies', async () => {
    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);
    const res = await auth.handler(makeRequest('POST', '/signout', {}, cookies));
    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie();
    // Should contain clear cookies (Max-Age=0)
    const clearedSid = setCookies.find((c) => c.includes('vertz.sid='));
    expect(clearedSid).toContain('Max-Age=0');
  });

  it('GET /session returns null immediately after signout', async () => {
    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);

    const signoutRes = await auth.handler(makeRequest('POST', '/signout', {}, cookies));
    expect(signoutRes.status).toBe(200);

    const sessionRes = await auth.handler(makeRequest('GET', '/session', undefined, cookies));
    expect(sessionRes.status).toBe(200);
    const data = await sessionRes.json();
    expect(data.session).toBeNull();
  });

  // =========================================================================
  // Refresh rate limiting
  // =========================================================================

  it('refresh rate limits after many attempts', async () => {
    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);

    // Send 10 rapid refresh requests
    for (let i = 0; i < 10; i++) {
      await auth.handler(makeRequest('POST', '/refresh', {}, cookies));
    }

    // 11th should be rate limited
    const res = await auth.handler(makeRequest('POST', '/refresh', {}, cookies));
    expect(res.status).toBe(429);
  });

  // =========================================================================
  // Signin rate limiting
  // =========================================================================

  it('signin rate limits after repeated failed attempts', async () => {
    await signUp(auth);

    // 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await signIn(auth, 'user@example.com', 'WrongPassword123!');
    }

    // 6th should be rate limited
    const res = await signIn(auth, 'user@example.com', 'WrongPassword123!');
    expect(res.status).toBe(429);
  });
});

describe('Email Verification Handler Edge Cases', () => {
  let auth: AuthInstance;

  beforeEach(() => {
    const result = createTestAuthWithEmailVerification();
    auth = result.auth;
  });

  afterEach(() => {
    auth.dispose();
  });

  it('verify-email returns 400 when token is missing from body', async () => {
    const res = await auth.handler(makeRequest('POST', '/verify-email', {}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('TOKEN_INVALID');
  });

  it('resend-verification returns 400 when email verification is not configured', async () => {
    auth.dispose();
    auth = createTestAuth();

    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);

    const res = await auth.handler(makeRequest('POST', '/resend-verification', {}, cookies));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('AUTH_VALIDATION_ERROR');
  });

  it('reset-password returns 400 when token is missing from body', async () => {
    const res = await auth.handler(
      makeRequest('POST', '/reset-password', { password: 'NewPassword456!' }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('TOKEN_INVALID');
  });

  it('forgot-password does not wait for delivery callback before responding', async () => {
    auth.dispose();

    let releaseSend: (() => void) | null = null;
    auth = createAuth({
      session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
      emailPassword: { enabled: true },
      privateKey: TEST_PRIVATE_KEY,
      publicKey: TEST_PUBLIC_KEY,
      isProduction: false,
      passwordReset: {
        enabled: true,
        tokenTtl: '1h',
        onSend: async () =>
          await new Promise<void>((resolve) => {
            releaseSend = resolve;
          }),
      },
    });

    await signUp(auth, 'forgot@example.com');

    const pendingResponse = auth.handler(
      makeRequest('POST', '/forgot-password', { email: 'forgot@example.com' }),
    );

    const race = await Promise.race([
      pendingResponse.then(() => 'resolved'),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 500)),
    ]);

    releaseSend?.();

    expect(race).toBe('resolved');
    const response = await pendingResponse;
    expect(response.status).toBe(200);
  });
});

// =========================================================================
// MFA routes when MFA is NOT configured
// =========================================================================

describe('MFA Handler — Not Configured', () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createTestAuth(); // No MFA config
  });

  afterEach(() => {
    auth.dispose();
  });

  it('POST /mfa/setup returns 400 when MFA not configured', async () => {
    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);
    const res = await auth.handler(makeRequest('POST', '/mfa/setup', {}, cookies));
    expect(res.status).toBe(400);
  });

  it('POST /mfa/verify-setup returns 400 when MFA not configured', async () => {
    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);
    const res = await auth.handler(
      makeRequest('POST', '/mfa/verify-setup', { code: '123456' }, cookies),
    );
    expect(res.status).toBe(400);
  });

  it('POST /mfa/disable returns 400 when MFA not configured', async () => {
    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);
    const res = await auth.handler(
      makeRequest('POST', '/mfa/disable', { password: 'Password123!' }, cookies),
    );
    expect(res.status).toBe(400);
  });

  it('POST /mfa/backup-codes returns 400 when MFA not configured', async () => {
    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);
    const res = await auth.handler(
      makeRequest('POST', '/mfa/backup-codes', { password: 'Password123!' }, cookies),
    );
    expect(res.status).toBe(400);
  });

  it('GET /mfa/status returns 400 when MFA not configured', async () => {
    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);
    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/status', {
        method: 'GET',
        headers: { Origin: 'http://localhost', 'X-VTZ-Request': '1', Cookie: cookies },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('POST /mfa/step-up returns 400 when MFA not configured', async () => {
    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);
    const res = await auth.handler(
      makeRequest('POST', '/mfa/step-up', { code: '123456' }, cookies),
    );
    expect(res.status).toBe(400);
  });

  it('POST /mfa/challenge returns 400 when MFA not configured', async () => {
    const res = await auth.handler(makeRequest('POST', '/mfa/challenge', { code: '123456' }));
    expect(res.status).toBe(400);
  });
});

// =========================================================================
// MFA routes — not authenticated
// =========================================================================

describe('MFA Handler — Not Authenticated', () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createAuth({
      session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
      emailPassword: { enabled: true },
      privateKey: TEST_PRIVATE_KEY,
      publicKey: TEST_PUBLIC_KEY,
      isProduction: false,
      mfa: { enabled: true, issuer: 'TestApp' },
      oauthEncryptionKey: 'mfa-encryption-key-at-least-32-chars-long!!',
    });
  });

  afterEach(() => {
    auth.dispose();
  });

  it('POST /mfa/setup returns 401 without session', async () => {
    const res = await auth.handler(makeRequest('POST', '/mfa/setup', {}));
    expect(res.status).toBe(401);
  });

  it('POST /mfa/verify-setup returns 401 without session', async () => {
    const res = await auth.handler(makeRequest('POST', '/mfa/verify-setup', { code: '123456' }));
    expect(res.status).toBe(401);
  });

  it('POST /mfa/disable returns 401 without session', async () => {
    const res = await auth.handler(makeRequest('POST', '/mfa/disable', { password: 'test' }));
    expect(res.status).toBe(401);
  });

  it('POST /mfa/backup-codes returns 401 without session', async () => {
    const res = await auth.handler(makeRequest('POST', '/mfa/backup-codes', { password: 'test' }));
    expect(res.status).toBe(401);
  });

  it('GET /mfa/status returns 401 without session', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/status', {
        method: 'GET',
        headers: { Origin: 'http://localhost', 'X-VTZ-Request': '1' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('POST /mfa/step-up returns 401 without session', async () => {
    const res = await auth.handler(makeRequest('POST', '/mfa/step-up', { code: '123456' }));
    expect(res.status).toBe(401);
  });

  it('POST /mfa/challenge returns 401 without MFA cookie', async () => {
    const res = await auth.handler(makeRequest('POST', '/mfa/challenge', { code: '123456' }));
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// OAuth routes when OAuth is NOT configured
// =========================================================================

describe('OAuth Handler — Not Configured', () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createTestAuth(); // No OAuth config
  });

  afterEach(() => {
    auth.dispose();
  });

  it('GET /oauth/google returns 400 when OAuth not configured', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/oauth/google', {
        method: 'GET',
        headers: { Origin: 'http://localhost', 'X-VTZ-Request': '1' },
      }),
    );
    // Provider not registered — falls through to 404 since no oauth routes registered
    expect(res.status).toBe(404);
  });

  it('GET /oauth/google/callback returns redirect to error when not configured', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/oauth/google/callback?code=test&state=test', {
        method: 'GET',
        headers: { Origin: 'http://localhost', 'X-VTZ-Request': '1' },
      }),
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('error=provider_not_configured');
  });
});

describe('Auth Middleware', () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createTestAuth();
  });

  afterEach(() => {
    auth.dispose();
  });

  it('middleware sets user and session for authenticated request', async () => {
    const signupRes = await signUp(auth);
    const cookies = getCookies(signupRes);

    const mw = auth.middleware();
    const ctx: Record<string, unknown> = {
      headers: new Headers({
        Cookie: cookies,
      }),
    };

    let nextCalled = false;
    await mw(ctx, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(ctx.user).toBeDefined();
    expect(ctx.session).toBeDefined();
  });

  it('middleware sets user and session to null for unauthenticated request', async () => {
    const mw = auth.middleware();
    const ctx: Record<string, unknown> = {
      headers: new Headers(),
    };

    let nextCalled = false;
    await mw(ctx, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(ctx.user).toBeNull();
    expect(ctx.session).toBeNull();
  });
});

describe('Config validation edge cases', () => {
  it('throws when only privateKey is provided without publicKey', () => {
    expect(() =>
      createAuth({
        session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
        emailPassword: { enabled: true },
        privateKey: TEST_PRIVATE_KEY,
        isProduction: false,
      }),
    ).toThrow('Both privateKey and publicKey must be provided together');
  });

  it('throws when only publicKey is provided without privateKey', () => {
    expect(() =>
      createAuth({
        session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
        emailPassword: { enabled: true },
        publicKey: TEST_PUBLIC_KEY,
        isProduction: false,
      }),
    ).toThrow('Both privateKey and publicKey must be provided together');
  });
});

describe('JWKS and access-set endpoints', () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createAuth({
      session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
      emailPassword: { enabled: true },
      privateKey: TEST_PRIVATE_KEY,
      publicKey: TEST_PUBLIC_KEY,
      isProduction: false,
    });
  });

  it('GET /.well-known/jwks.json returns JSON with keys array', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/.well-known/jwks.json', { method: 'GET' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toBeDefined();
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0].use).toBe('sig');
    expect(body.keys[0].alg).toBe('RS256');
  });

  it('GET /access-set returns 404 when access not configured', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/access-set', { method: 'GET' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Access control not configured');
  });

  it('DELETE /sessions returns error for unauthenticated request', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/sessions', { method: 'DELETE' }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('DELETE /session with invalid body returns error', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/session', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('Body parse error paths', () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createAuth({
      session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
      emailPassword: { enabled: true },
      privateKey: TEST_PRIVATE_KEY,
      publicKey: TEST_PUBLIC_KEY,
      isProduction: false,
    });
  });

  it('POST /signup with invalid JSON returns 400', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('POST /signin with missing fields returns validation error', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('POST /forgot-password with invalid body returns 400', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('POST /verify-email with invalid body returns 400', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('POST /switch-tenant returns 404 when not configured', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/switch-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad',
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe('MFA challenge error paths', { timeout: 60_000 }, () => {
  const encKey = 'mfa-test-encryption-key-at-least-32-chars!!!';

  function createMfaAuth() {
    return createAuth({
      session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
      emailPassword: { enabled: true },
      privateKey: TEST_PRIVATE_KEY,
      publicKey: TEST_PUBLIC_KEY,
      isProduction: false,
      mfa: { enabled: true, issuer: 'TestApp' },
      oauthEncryptionKey: encKey,
    });
  }

  it('POST /mfa/challenge returns 429 when rate limited', async () => {
    const auth = createMfaAuth();

    // Fire 6 requests to trip the rate limit (limit is 5)
    for (let i = 0; i < 6; i++) {
      await auth.handler(
        new Request('http://localhost/api/auth/mfa/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: 'vertz.mfa=garbage' },
          body: JSON.stringify({ code: '123456' }),
        }),
      );
    }

    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: 'vertz.mfa=garbage' },
        body: JSON.stringify({ code: '123456' }),
      }),
    );
    expect(res.status).toBe(429);
  });

  it('POST /mfa/challenge with expired token returns 401', async () => {
    const auth = createMfaAuth();

    // Create a challenge token that expired in the past
    const challengeData = JSON.stringify({
      userId: 'user-1',
      expiresAt: Date.now() - 60_000, // expired 1 minute ago
    });
    const encryptedChallenge = await encrypt(challengeData, encKey);

    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `vertz.mfa=${encryptedChallenge}`,
        },
        body: JSON.stringify({ code: '123456' }),
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('SESSION_EXPIRED');
  });

  it('POST /mfa/challenge with invalid encrypted token returns 401', async () => {
    const auth = createMfaAuth();

    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'vertz.mfa=not-valid-encrypted-data',
        },
        body: JSON.stringify({ code: '123456' }),
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('SESSION_EXPIRED');
  });
});
