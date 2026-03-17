/**
 * Integration Test: MFA/TOTP with Backup Codes
 * Uses @vertz/server public imports only — validates the full MFA lifecycle end-to-end.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import type { AuthConfig, AuthInstance } from '@vertz/server';
import { checkFva, createAuth, InMemoryMFAStore } from '@vertz/server';

const { publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// TOTP code generation — internal import for test verification only
// (In a real app, the user would use an authenticator app)
import { generateTotpCode } from '../../../server/src/auth/totp';

function createTestAuth(overrides?: Partial<AuthConfig>): AuthInstance {
  return createAuth({
    session: {
      strategy: 'jwt',
      ttl: '60s',
      refreshTtl: '7d',
    },
    privateKey: TEST_PRIVATE_KEY as string,
    publicKey: TEST_PUBLIC_KEY as string,
    isProduction: false,
    mfa: { enabled: true, issuer: 'VertzTest' },
    oauthEncryptionKey: 'mfa-integration-encryption-key-32-chars!!!',
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

/** Helper: sign up and get session cookie */
async function signUpAndGetSession(auth: AuthInstance, email: string): Promise<string> {
  const result = await auth.api.signUp({ email, password: 'password123' });
  if (!result.ok || !result.data.tokens) throw new Error('Sign up failed');
  return `vertz.sid=${result.data.tokens.jwt}`;
}

/** Helper: setup MFA for a user and return the secret + backup codes */
async function setupMfa(
  auth: AuthInstance,
  cookie: string,
): Promise<{ secret: string; backupCodes: string[] }> {
  const setupRes = await auth.handler(
    new Request('http://localhost/api/auth/mfa/setup', {
      method: 'POST',
      headers: { Cookie: cookie },
    }),
  );
  const { secret } = (await setupRes.json()) as { secret: string };

  const code = await generateTotpCode(secret);
  const verifyRes = await auth.handler(
    new Request('http://localhost/api/auth/mfa/verify-setup', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }),
  );
  const { backupCodes } = (await verifyRes.json()) as { backupCodes: string[] };

  return { secret, backupCodes };
}

/** Helper: sign in and complete MFA challenge */
async function signInWithMfa(
  auth: AuthInstance,
  email: string,
  password: string,
  totpSecret: string,
): Promise<{ sessionCookie: string; refreshCookie: string }> {
  // Sign in — get MFA challenge
  const signInRes = await auth.handler(
    new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  );
  const mfaCookies = parseCookies(signInRes);
  const mfaCookie = `vertz.mfa=${mfaCookies['vertz.mfa']}`;

  // Complete MFA challenge
  const code = await generateTotpCode(totpSecret);
  const challengeRes = await auth.handler(
    new Request('http://localhost/api/auth/mfa/challenge', {
      method: 'POST',
      headers: { Cookie: mfaCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }),
  );
  const cookies = parseCookies(challengeRes);
  return {
    sessionCookie: `vertz.sid=${cookies['vertz.sid']}`,
    refreshCookie: `vertz.ref=${cookies['vertz.ref']}`,
  };
}

describe('MFA Integration', { timeout: 120_000 }, () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createTestAuth();
  });

  afterEach(() => {
    auth.dispose();
  });

  it('Full MFA lifecycle: setup → verify-setup → signIn → challenge → session', async () => {
    const email = 'lifecycle@test.com';
    const cookie = await signUpAndGetSession(auth, email);

    // Setup MFA
    const { secret } = await setupMfa(auth, cookie);

    // Sign in — should require MFA
    const signInRes = await auth.handler(
      new Request('http://localhost/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      }),
    );
    expect(signInRes.status).toBe(403);

    // Complete MFA challenge
    const mfaCookies = parseCookies(signInRes);
    const mfaCookie = `vertz.mfa=${mfaCookies['vertz.mfa']}`;
    const totpCode = await generateTotpCode(secret);
    const challengeRes = await auth.handler(
      new Request('http://localhost/api/auth/mfa/challenge', {
        method: 'POST',
        headers: { Cookie: mfaCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode }),
      }),
    );
    expect(challengeRes.status).toBe(200);

    // Verify session works
    const sessionCookies = parseCookies(challengeRes);
    const sessionCookie = `vertz.sid=${sessionCookies['vertz.sid']}`;
    const sessionRes = await auth.handler(
      new Request('http://localhost/api/auth/session', {
        method: 'GET',
        headers: { Cookie: sessionCookie },
      }),
    );
    const { session } = (await sessionRes.json()) as {
      session: { user: { email: string } };
    };
    expect(session).not.toBeNull();
    expect(session.user.email).toBe(email);
  });

  it('Backup code flow: setup MFA → signIn → use backup code → session', async () => {
    const email = 'backup@test.com';
    const cookie = await signUpAndGetSession(auth, email);
    const { backupCodes } = await setupMfa(auth, cookie);

    // Sign in — get MFA challenge
    const signInRes = await auth.handler(
      new Request('http://localhost/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      }),
    );
    const mfaCookies = parseCookies(signInRes);
    const mfaCookie = `vertz.mfa=${mfaCookies['vertz.mfa']}`;

    // Use backup code
    const challengeRes = await auth.handler(
      new Request('http://localhost/api/auth/mfa/challenge', {
        method: 'POST',
        headers: { Cookie: mfaCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: backupCodes[0] }),
      }),
    );
    expect(challengeRes.status).toBe(200);
  });

  it('Step-up auth: signIn with MFA → step-up → updated fva', async () => {
    const email = 'stepup@test.com';
    const cookie = await signUpAndGetSession(auth, email);
    const { secret } = await setupMfa(auth, cookie);

    // Sign in with MFA
    const { sessionCookie } = await signInWithMfa(auth, email, 'password123', secret);

    // Get session — should have fva
    const sessionRes1 = await auth.handler(
      new Request('http://localhost/api/auth/session', {
        method: 'GET',
        headers: { Cookie: sessionCookie },
      }),
    );
    const session1 = (await sessionRes1.json()) as {
      session: { payload: { fva?: number } };
    };
    expect(session1.session.payload.fva).toBeDefined();

    // Step-up
    const stepUpCode = await generateTotpCode(secret);
    const stepUpRes = await auth.handler(
      new Request('http://localhost/api/auth/mfa/step-up', {
        method: 'POST',
        headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: stepUpCode }),
      }),
    );
    expect(stepUpRes.status).toBe(200);

    // New session should have updated fva
    const newCookies = parseCookies(stepUpRes);
    const newSessionCookie = `vertz.sid=${newCookies['vertz.sid']}`;
    const sessionRes2 = await auth.handler(
      new Request('http://localhost/api/auth/session', {
        method: 'GET',
        headers: { Cookie: newSessionCookie },
      }),
    );
    const session2 = (await sessionRes2.json()) as {
      session: { payload: { fva: number } };
    };
    const fva1 = session1.session.payload.fva ?? 0;
    expect(session2.session.payload.fva).toBeGreaterThanOrEqual(fva1);
  });

  it('Disable MFA: enable → disable with password → signIn without challenge', async () => {
    const email = 'disable@test.com';
    const cookie = await signUpAndGetSession(auth, email);
    await setupMfa(auth, cookie);

    // Disable MFA
    const disableRes = await auth.handler(
      new Request('http://localhost/api/auth/mfa/disable', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'password123' }),
      }),
    );
    expect(disableRes.status).toBe(200);

    // Sign in — should NOT require MFA
    const signInRes = await auth.handler(
      new Request('http://localhost/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      }),
    );
    expect(signInRes.status).toBe(200);
    const cookies = parseCookies(signInRes);
    expect(cookies['vertz.sid']).toBeDefined();
  });

  it('MFA-enabled user cannot bypass challenge', async () => {
    const email = 'bypass@test.com';
    const cookie = await signUpAndGetSession(auth, email);
    await setupMfa(auth, cookie);

    // Sign in — should get 403, not 200
    const signInRes = await auth.handler(
      new Request('http://localhost/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      }),
    );
    expect(signInRes.status).toBe(403);
    const body = (await signInRes.json()) as { error: { code: string } };
    expect(body.error.code).toBe('MFA_REQUIRED');

    // No session cookie should be set
    const cookies = parseCookies(signInRes);
    expect(cookies['vertz.sid']).toBeUndefined();
  });

  it('Backup code is consumed and cannot be reused', { timeout: 30_000 }, async () => {
    const email = 'consume@test.com';
    const cookie = await signUpAndGetSession(auth, email);
    const { backupCodes } = await setupMfa(auth, cookie);

    // First use — succeeds
    const signInRes1 = await auth.handler(
      new Request('http://localhost/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      }),
    );
    const mfaCookie1 = `vertz.mfa=${parseCookies(signInRes1)['vertz.mfa']}`;
    const res1 = await auth.handler(
      new Request('http://localhost/api/auth/mfa/challenge', {
        method: 'POST',
        headers: { Cookie: mfaCookie1, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: backupCodes[0] }),
      }),
    );
    expect(res1.status).toBe(200);

    // Second use of same code — fails
    const signInRes2 = await auth.handler(
      new Request('http://localhost/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      }),
    );
    const mfaCookie2 = `vertz.mfa=${parseCookies(signInRes2)['vertz.mfa']}`;
    const res2 = await auth.handler(
      new Request('http://localhost/api/auth/mfa/challenge', {
        method: 'POST',
        headers: { Cookie: mfaCookie2, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: backupCodes[0] }),
      }),
    );
    expect(res2.status).toBe(400);
  });

  it('Regenerate backup codes replaces old ones', { timeout: 30_000 }, async () => {
    const email = 'regen@test.com';
    const cookie = await signUpAndGetSession(auth, email);
    const { backupCodes: oldCodes } = await setupMfa(auth, cookie);

    // Regenerate
    const regenRes = await auth.handler(
      new Request('http://localhost/api/auth/mfa/backup-codes', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'password123' }),
      }),
    );
    expect(regenRes.status).toBe(200);
    const { backupCodes: newCodes } = (await regenRes.json()) as { backupCodes: string[] };
    expect(newCodes).toHaveLength(10);

    // Old codes should not work anymore — sign in and try
    const signInRes = await auth.handler(
      new Request('http://localhost/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      }),
    );
    const mfaCookie = `vertz.mfa=${parseCookies(signInRes)['vertz.mfa']}`;
    const oldCodeRes = await auth.handler(
      new Request('http://localhost/api/auth/mfa/challenge', {
        method: 'POST',
        headers: { Cookie: mfaCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: oldCodes[0] }),
      }),
    );
    expect(oldCodeRes.status).toBe(400);
  });

  it('checkFva utility works with session payload', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(
      checkFva(
        { sub: '', email: '', role: '', iat: 0, exp: 0, jti: '', sid: '', fva: now - 30 },
        300,
      ),
    ).toBe(true);
    expect(
      checkFva(
        { sub: '', email: '', role: '', iat: 0, exp: 0, jti: '', sid: '', fva: now - 600 },
        300,
      ),
    ).toBe(false);
    expect(checkFva({ sub: '', email: '', role: '', iat: 0, exp: 0, jti: '', sid: '' }, 300)).toBe(
      false,
    );
  });

  it('InMemoryMFAStore can be instantiated from public API', () => {
    const store = new InMemoryMFAStore();
    expect(store).toBeDefined();
    store.dispose();
  });
});
