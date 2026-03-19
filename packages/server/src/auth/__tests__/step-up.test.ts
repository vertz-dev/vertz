/**
 * Step-Up Authentication Tests — Sub-Phase 5
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { createAuth } from '../index';
import { generateTotpCode } from '../totp';
import type { AuthConfig, AuthInstance } from '../types';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

function createTestAuth(overrides?: Partial<AuthConfig>): AuthInstance {
  return createAuth({
    session: {
      strategy: 'jwt',
      ttl: '60s',
      refreshTtl: '7d',
    },
    privateKey: TEST_PRIVATE_KEY,
    publicKey: TEST_PUBLIC_KEY,
    isProduction: false,
    mfa: { enabled: true, issuer: 'TestApp' },
    oauthEncryptionKey: 'step-up-encryption-key-at-least-32-chars!!!',
    ...overrides,
  });
}

function parseCookies(response: Response): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const header of response.headers.getSetCookie()) {
    const [nameValue] = header.split(';');
    const [name, ...rest] = nameValue.split('=');
    cookies[name.trim()] = rest.join('=');
  }
  return cookies;
}

/** Sign up, enable MFA, then sign in fully (through challenge), return session cookie + secret */
async function signUpMfaAndSignIn(
  auth: AuthInstance,
  email = 'stepup@test.com',
): Promise<{ sessionCookie: string; refreshCookie: string; secret: string }> {
  // Sign up
  const signUpResult = await auth.api.signUp({ email, password: 'password123' });
  if (!signUpResult.ok || !signUpResult.data.tokens) throw new Error('Sign up failed');
  const setupCookie = `vertz.sid=${signUpResult.data.tokens.jwt}`;

  // Setup MFA
  const setupRes = await auth.handler(
    new Request('http://localhost/api/auth/mfa/setup', {
      method: 'POST',
      headers: { Cookie: setupCookie },
    }),
  );
  const { secret } = (await setupRes.json()) as { secret: string };

  // Verify setup
  const setupCode = await generateTotpCode(secret);
  await auth.handler(
    new Request('http://localhost/api/auth/mfa/verify-setup', {
      method: 'POST',
      headers: { Cookie: setupCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: setupCode }),
    }),
  );

  // Sign in (will get MFA challenge)
  const signInRes = await auth.handler(
    new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    }),
  );
  const mfaCookies = parseCookies(signInRes);
  const mfaCookie = `vertz.mfa=${mfaCookies['vertz.mfa']}`;

  // Complete MFA challenge
  const challengeCode = await generateTotpCode(secret);
  const challengeRes = await auth.handler(
    new Request('http://localhost/api/auth/mfa/challenge', {
      method: 'POST',
      headers: { Cookie: mfaCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: challengeCode }),
    }),
  );
  const sessionCookies = parseCookies(challengeRes);
  const sessionCookie = `vertz.sid=${sessionCookies['vertz.sid']}`;
  const refreshCookie = `vertz.ref=${sessionCookies['vertz.ref']}`;

  return { sessionCookie, refreshCookie, secret };
}

describe('Step-Up Authentication', { timeout: 60_000 }, () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createTestAuth();
  });

  it('POST /mfa/step-up with valid code returns new session with updated fva', async () => {
    const { sessionCookie, secret } = await signUpMfaAndSignIn(auth);

    const code = await generateTotpCode(secret);
    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/step-up', {
        method: 'POST',
        headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
    );
    expect(res.status).toBe(200);

    // Should return new session cookie
    const cookies = parseCookies(res);
    expect(cookies['vertz.sid']).toBeDefined();
  });

  it('POST /mfa/step-up with invalid code returns MFA_INVALID_CODE', async () => {
    const { sessionCookie } = await signUpMfaAndSignIn(auth);

    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/step-up', {
        method: 'POST',
        headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '000000' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('MFA_INVALID_CODE');
  });

  it('POST /mfa/step-up requires authentication', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/step-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '123456' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('session created after MFA challenge includes fva claim', async () => {
    const { sessionCookie } = await signUpMfaAndSignIn(auth);

    // Get session to check payload
    const sessionRes = await auth.handler(
      new Request('http://localhost/api/auth/session', {
        method: 'GET',
        headers: { Cookie: sessionCookie },
      }),
    );
    const { session } = (await sessionRes.json()) as {
      session: { payload: { fva?: number } } | null;
    };
    expect(session).not.toBeNull();
    expect(session!.payload.fva).toBeDefined();
    expect(typeof session!.payload.fva).toBe('number');
  });

  it('token refresh preserves fva value', async () => {
    const { sessionCookie, refreshCookie, secret } = await signUpMfaAndSignIn(auth);

    // Get fva from the MFA-authenticated session
    const sessionRes1 = await auth.handler(
      new Request('http://localhost/api/auth/session', {
        method: 'GET',
        headers: { Cookie: sessionCookie },
      }),
    );
    const s1 = (await sessionRes1.json()) as {
      session: { payload: { fva?: number } } | null;
    };
    expect(s1.session!.payload.fva).toBeDefined();
    const originalFva = s1.session!.payload.fva;

    // Refresh the session using the refresh cookie from MFA sign-in
    const refreshRes = await auth.handler(
      new Request('http://localhost/api/auth/refresh', {
        method: 'POST',
        headers: { Cookie: refreshCookie },
      }),
    );
    expect(refreshRes.status).toBe(200);
    const refreshedCookies = parseCookies(refreshRes);
    const refreshedSession = `vertz.sid=${refreshedCookies['vertz.sid']}`;

    // Check fva is preserved after refresh
    const sessionRes2 = await auth.handler(
      new Request('http://localhost/api/auth/session', {
        method: 'GET',
        headers: { Cookie: refreshedSession },
      }),
    );
    const s2 = (await sessionRes2.json()) as {
      session: { payload: { fva?: number } } | null;
    };
    expect(s2.session!.payload.fva).toBe(originalFva);
  });

  it('session created without MFA has no fva claim', async () => {
    // Sign up without MFA
    const result = await auth.api.signUp({ email: 'nofva@test.com', password: 'password123' });
    if (!result.ok || !result.data.tokens) throw new Error('fail');
    const cookie = `vertz.sid=${result.data.tokens.jwt}`;

    const sessionRes = await auth.handler(
      new Request('http://localhost/api/auth/session', {
        method: 'GET',
        headers: { Cookie: cookie },
      }),
    );
    const { session } = (await sessionRes.json()) as {
      session: { payload: { fva?: number } } | null;
    };
    expect(session).not.toBeNull();
    expect(session!.payload.fva).toBeUndefined();
  });

  it('step-up returns error when user has no MFA enabled', async () => {
    // Sign up without enabling MFA
    const result = await auth.api.signUp({
      email: 'nomfa-stepup@test.com',
      password: 'password123',
    });
    if (!result.ok || !result.data.tokens) throw new Error('fail');
    const cookie = `vertz.sid=${result.data.tokens.jwt}`;

    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/step-up', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '123456' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('MFA_NOT_ENABLED');
  });

  it('step-up returns 429 when rate limited', async () => {
    const result = await auth.api.signUp({
      email: 'ratelimit-stepup@test.com',
      password: 'password123',
    });
    if (!result.ok || !result.data.tokens) throw new Error('fail');
    const cookie = `vertz.sid=${result.data.tokens.jwt}`;

    // Fire 6 requests (limit is 5) to trigger rate limit
    for (let i = 0; i < 6; i++) {
      await auth.handler(
        new Request('http://localhost/api/auth/mfa/step-up', {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: '123456' }),
        }),
      );
    }

    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/step-up', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '123456' }),
      }),
    );
    expect(res.status).toBe(429);
  });
});
