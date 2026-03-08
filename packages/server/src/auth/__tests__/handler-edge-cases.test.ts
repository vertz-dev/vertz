import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createAuth } from '../index';
import type { AuthInstance } from '../types';

/**
 * Tests for HTTP handler edge cases — error paths, 404 routes, middleware,
 * and auth error status mapping that other test files don't exercise.
 */

function createTestAuth() {
  const auth = createAuth({
    session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
    emailPassword: { enabled: true },
    jwtSecret: 'test-secret-for-handler-edge-cases-testing-1234567890',
    isProduction: false,
  });
  return auth;
}

function createTestAuthWithEmailVerification() {
  const sentEmails: { email: string; token: string }[] = [];
  const auth = createAuth({
    session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
    emailPassword: { enabled: true },
    jwtSecret: 'test-secret-for-handler-edge-cases-testing-1234567890',
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

function makeRequest(method: string, path: string, body?: Record<string, unknown>, cookies = '') {
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
      jwtSecret: 'test-secret-for-handler-edge-cases-testing-1234567890',
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
