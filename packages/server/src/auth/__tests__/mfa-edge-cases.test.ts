/**
 * MFA Edge Cases — Coverage hardening for auth/index.ts
 * Tests: challenge with no secret, corrupted secret, backup codes in challenge,
 * invalid code, user deleted after challenge, expired pending setup,
 * passwordless account MFA operations, step-up decryption failure
 */

import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { encrypt } from '../crypto';
import { createAuth } from '../index';
import { InMemoryMFAStore } from '../mfa-store';
import { InMemoryOAuthAccountStore } from '../oauth-account-store';
import { generateTotpCode } from '../totp';
import type { AuthConfig, AuthInstance, OAuthProvider } from '../types';
import { InMemoryUserStore } from '../user-store';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

const ENCRYPTION_KEY = 'mfa-encryption-key-at-least-32-chars-long!!';

function createMockProvider(overrides?: Partial<OAuthProvider>): OAuthProvider {
  return {
    id: 'mock',
    name: 'Mock',
    scopes: ['openid', 'email'],
    trustEmail: false,
    getAuthorizationUrl: (state: string) => {
      const params = new URLSearchParams({ client_id: 'mock-client', state });
      return `https://mock-provider.com/auth?${params.toString()}`;
    },
    exchangeCode: async () => ({ accessToken: 'mock-access-token' }),
    getUserInfo: async () => ({
      providerId: 'mock-provider-id-123',
      email: 'oauth-only@test.com',
      emailVerified: true,
      raw: { id: 'mock-provider-id-123', login: 'mockuser', name: 'OAuth User' },
    }),
    ...overrides,
  };
}

function createTestAuth(overrides?: Partial<AuthConfig>): AuthInstance {
  return createAuth({
    session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
    privateKey: TEST_PRIVATE_KEY,
    publicKey: TEST_PUBLIC_KEY,
    isProduction: false,
    mfa: { enabled: true, issuer: 'TestApp' },
    oauthEncryptionKey: ENCRYPTION_KEY,
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

async function signUpAndGetSession(auth: AuthInstance, email = 'mfa@test.com'): Promise<string> {
  const result = await auth.api.signUp({ email, password: 'password123' });
  if (!result.ok || !result.data.tokens) throw new Error('Sign up failed');
  return `vertz.sid=${result.data.tokens.jwt}`;
}

async function getSessionUserId(auth: AuthInstance, cookie: string): Promise<string> {
  const headers = new Headers({ cookie });
  const result = await auth.api.getSession(headers);
  if (!result.ok || !result.data) throw new Error('Failed to get session');
  return result.data.user.id;
}

async function setupAndEnableMfa(
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

async function signInAndGetMfaCookie(auth: AuthInstance, email = 'mfa@test.com'): Promise<string> {
  const signInRes = await auth.handler(
    new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    }),
  );
  expect(signInRes.status).toBe(403);
  const cookies = parseCookies(signInRes);
  expect(cookies['vertz.mfa']).toBeDefined();
  return `vertz.mfa=${cookies['vertz.mfa']}`;
}

/**
 * Creates a session cookie for a user via OAuth flow (no password needed)
 */
async function oauthSignInAndGetSession(auth: AuthInstance): Promise<string> {
  // Initiate OAuth
  const initiateRes = await auth.handler(new Request('http://localhost:3000/api/auth/oauth/mock'));
  const location = initiateRes.headers.get('Location') ?? '';
  const state = new URL(location).searchParams.get('state') ?? '';
  const setCookie = initiateRes.headers.getSetCookie();
  const oauthCookie = setCookie.find((c) => c.startsWith('vertz.oauth='))?.split(';')[0] ?? '';

  // Callback
  const callbackRes = await auth.handler(
    new Request(
      `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
      { headers: { cookie: oauthCookie } },
    ),
  );
  const cookies = parseCookies(callbackRes);
  return `vertz.sid=${cookies['vertz.sid']}`;
}

describe('MFA Edge Cases', { timeout: 60_000 }, () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({}));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Given a user with MFA challenge but no TOTP secret stored', () => {
    describe('When the MFA challenge endpoint is called', () => {
      it('Then returns 400 MFA_NOT_ENABLED', async () => {
        const mfaStore = new InMemoryMFAStore();
        const auth = createTestAuth({ mfaStore });

        const cookie = await signUpAndGetSession(auth);
        await setupAndEnableMfa(auth, cookie);

        // Remove the secret while keeping MFA enabled
        const userId = await getSessionUserId(auth, cookie);
        (mfaStore as unknown as { secrets: Map<string, string> }).secrets.delete(userId);

        // Sign in triggers MFA challenge
        const mfaCookie = await signInAndGetMfaCookie(auth);

        const res = await auth.handler(
          new Request('http://localhost/api/auth/mfa/challenge', {
            method: 'POST',
            headers: { Cookie: mfaCookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: '000000' }),
          }),
        );
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe('MFA_NOT_ENABLED');
      });
    });
  });

  describe('Given a user with corrupted encrypted TOTP secret', () => {
    describe('When the MFA challenge endpoint is called', () => {
      it('Then returns 500 Internal error', async () => {
        const mfaStore = new InMemoryMFAStore();
        const auth = createTestAuth({ mfaStore });

        const cookie = await signUpAndGetSession(auth);
        await setupAndEnableMfa(auth, cookie);

        // Corrupt the stored secret
        const userId = await getSessionUserId(auth, cookie);
        (mfaStore as unknown as { secrets: Map<string, string> }).secrets.set(
          userId,
          'corrupted-not-valid-encrypted-data',
        );

        const mfaCookie = await signInAndGetMfaCookie(auth);

        const res = await auth.handler(
          new Request('http://localhost/api/auth/mfa/challenge', {
            method: 'POST',
            headers: { Cookie: mfaCookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: '000000' }),
          }),
        );
        expect(res.status).toBe(500);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe('Internal error');
      });
    });
  });

  describe('Given a user with MFA enabled and backup codes', () => {
    describe('When the MFA challenge is completed with a backup code', () => {
      it('Then successfully authenticates and creates session', async () => {
        const auth = createTestAuth();
        const cookie = await signUpAndGetSession(auth);
        const { backupCodes } = await setupAndEnableMfa(auth, cookie);

        const mfaCookie = await signInAndGetMfaCookie(auth);

        const res = await auth.handler(
          new Request('http://localhost/api/auth/mfa/challenge', {
            method: 'POST',
            headers: { Cookie: mfaCookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: backupCodes[0] }),
          }),
        );
        expect(res.status).toBe(200);
        const responseCookies = parseCookies(res);
        expect(responseCookies['vertz.sid']).toBeDefined();
      });
    });
  });

  describe('Given a user with MFA enabled', () => {
    describe('When an invalid code is submitted to the challenge endpoint', () => {
      it('Then returns 400 MFA_INVALID_CODE', async () => {
        const auth = createTestAuth();
        const cookie = await signUpAndGetSession(auth);
        await setupAndEnableMfa(auth, cookie);

        const mfaCookie = await signInAndGetMfaCookie(auth);

        const res = await auth.handler(
          new Request('http://localhost/api/auth/mfa/challenge', {
            method: 'POST',
            headers: { Cookie: mfaCookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: '000000' }),
          }),
        );
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe('MFA_INVALID_CODE');
      });
    });
  });

  describe('Given a user deleted after MFA challenge verification succeeds', () => {
    describe('When the challenge creates a session for the deleted user', () => {
      it('Then returns 500 User not found', async () => {
        const userStore = new InMemoryUserStore();
        const auth = createTestAuth({ userStore });
        const cookie = await signUpAndGetSession(auth);
        const { secret } = await setupAndEnableMfa(auth, cookie);

        const mfaCookie = await signInAndGetMfaCookie(auth);

        // Override findById to return null (simulating user deletion after MFA check)
        const originalFindById = userStore.findById.bind(userStore);
        let interceptActive = false;
        userStore.findById = async (id: string) => {
          if (interceptActive) return null;
          return originalFindById(id);
        };
        interceptActive = true;

        const code = await generateTotpCode(secret);
        const res = await auth.handler(
          new Request('http://localhost/api/auth/mfa/challenge', {
            method: 'POST',
            headers: { Cookie: mfaCookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          }),
        );
        expect(res.status).toBe(500);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe('User not found');
      });
    });
  });

  describe('Given a pending MFA setup that has expired', () => {
    describe('When verify-setup is called after TTL expiration', () => {
      it('Then returns 400 MFA_NOT_ENABLED with pending cleanup', async () => {
        const auth = createTestAuth();
        const cookie = await signUpAndGetSession(auth);

        // Start MFA setup
        await auth.handler(
          new Request('http://localhost/api/auth/mfa/setup', {
            method: 'POST',
            headers: { Cookie: cookie },
          }),
        );

        // Advance Date.now() past the 10-minute TTL
        const originalDateNow = Date.now;
        Date.now = () => originalDateNow() + 11 * 60 * 1000;

        try {
          const res = await auth.handler(
            new Request('http://localhost/api/auth/mfa/verify-setup', {
              method: 'POST',
              headers: { Cookie: cookie, 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: '000000' }),
            }),
          );
          expect(res.status).toBe(400);
          const body = (await res.json()) as { error: { code: string; message: string } };
          expect(body.error.code).toBe('MFA_NOT_ENABLED');
          expect(body.error.message).toContain('No pending MFA setup');
        } finally {
          Date.now = originalDateNow;
        }
      });
    });
  });

  describe('Given a passwordless OAuth account with MFA enabled', () => {
    let auth: AuthInstance;
    let sessionCookie: string;

    beforeEach(async () => {
      const oauthAccountStore = new InMemoryOAuthAccountStore();
      const userStore = new InMemoryUserStore();
      const mfaStore = new InMemoryMFAStore();

      auth = createTestAuth({
        oauthAccountStore,
        userStore,
        mfaStore,
        providers: [createMockProvider()],
      });

      // Sign in via OAuth (creates user with no password)
      sessionCookie = await oauthSignInAndGetSession(auth);

      // Enable MFA directly in the store for the OAuth user
      const userId = await getSessionUserId(auth, sessionCookie);
      const secret = 'JBSWY3DPEHPK3PXP';
      const encryptedSecret = await encrypt(secret, ENCRYPTION_KEY);
      await mfaStore.enableMfa(userId, encryptedSecret);
    });

    describe('When attempting to disable MFA', () => {
      it('Then returns 401 because no password hash exists', async () => {
        const res = await auth.handler(
          new Request('http://localhost/api/auth/mfa/disable', {
            method: 'POST',
            headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'anything' }),
          }),
        );
        expect(res.status).toBe(401);
      });
    });

    describe('When attempting to regenerate backup codes', () => {
      it('Then returns 401 because no password hash exists', async () => {
        const res = await auth.handler(
          new Request('http://localhost/api/auth/mfa/backup-codes', {
            method: 'POST',
            headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'anything' }),
          }),
        );
        expect(res.status).toBe(401);
      });
    });
  });

  describe('Given a corrupted encrypted TOTP secret during step-up', () => {
    describe('When the step-up endpoint is called', () => {
      it('Then returns 500 Internal error', async () => {
        const mfaStore = new InMemoryMFAStore();
        const auth = createTestAuth({ mfaStore });

        const cookie = await signUpAndGetSession(auth);
        await setupAndEnableMfa(auth, cookie);

        // Corrupt the stored secret
        const userId = await getSessionUserId(auth, cookie);
        (mfaStore as unknown as { secrets: Map<string, string> }).secrets.set(
          userId,
          'corrupted-not-valid-encrypted-data',
        );

        const res = await auth.handler(
          new Request('http://localhost/api/auth/mfa/step-up', {
            method: 'POST',
            headers: { Cookie: cookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: '000000' }),
          }),
        );
        expect(res.status).toBe(500);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe('Internal error');
      });
    });
  });
});
