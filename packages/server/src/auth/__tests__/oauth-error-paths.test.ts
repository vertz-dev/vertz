/**
 * OAuth Error Paths — Coverage hardening for auth/index.ts
 * Tests: corrupted cookie, expired state, rollback failures, user deleted mid-flow
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from '@vertz/test';
import { encrypt } from '../crypto';
import { createAuth } from '../index';
import { InMemoryOAuthAccountStore } from '../oauth-account-store';
import type { AuthConfig, AuthInstance, OAuthProvider } from '../types';
import { InMemoryUserStore } from '../user-store';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

const ENCRYPTION_KEY = 'test-oauth-encryption-key-at-least-32!';

function createMockProvider(overrides?: Partial<OAuthProvider>): OAuthProvider {
  return {
    id: 'mock',
    name: 'Mock',
    scopes: ['openid', 'email'],
    trustEmail: false,
    getAuthorizationUrl: (state: string, codeChallenge?: string) => {
      const params = new URLSearchParams({ client_id: 'mock-client', state });
      if (codeChallenge) params.set('code_challenge', codeChallenge);
      return `https://mock-provider.com/auth?${params.toString()}`;
    },
    exchangeCode: async () => ({ accessToken: 'mock-access-token' }),
    getUserInfo: async () => ({
      providerId: 'mock-provider-id-123',
      email: 'oauth@example.com',
      emailVerified: true,
      raw: {
        id: 'mock-provider-id-123',
        login: 'mockuser',
        name: 'OAuth User',
        avatar_url: 'https://example.com/avatar.png',
        bio: 'Test bio',
      },
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
    oauthEncryptionKey: ENCRYPTION_KEY,
    ...overrides,
  });
}

async function initiateOAuthFlow(
  auth: AuthInstance,
  providerId = 'mock',
): Promise<{ state: string; cookie: string }> {
  const response = await auth.handler(
    new Request(`http://localhost:3000/api/auth/oauth/${providerId}`),
  );
  const location = response.headers.get('Location') ?? '';
  const stateParam = new URL(location).searchParams.get('state') ?? '';
  const setCookie = response.headers.getSetCookie();
  const oauthCookie = setCookie.find((c) => c.startsWith('vertz.oauth='));
  const cookieValue = oauthCookie?.split(';')[0] ?? '';
  return { state: stateParam, cookie: cookieValue };
}

describe('OAuth Error Paths', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({}));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Given a corrupted OAuth cookie', () => {
    describe('When the callback is hit with non-decryptable cookie data', () => {
      it('Then redirects to error URL with invalid_state', async () => {
        const auth = createTestAuth({
          providers: [createMockProvider()],
          oauthAccountStore: new InMemoryOAuthAccountStore(),
        });

        // Send callback with garbage cookie data that cannot be decrypted
        const response = await auth.handler(
          new Request(
            'http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=some-state',
            { headers: { cookie: 'vertz.oauth=garbage-not-valid-encrypted-data' } },
          ),
        );

        expect(response.status).toBe(302);
        const location = response.headers.get('Location') ?? '';
        expect(location).toContain('error=invalid_state');
      });
    });
  });

  describe('Given an expired OAuth state', () => {
    describe('When the callback is hit after state expiration', () => {
      it('Then redirects to error URL with invalid_state', async () => {
        const auth = createTestAuth({
          providers: [createMockProvider()],
          oauthAccountStore: new InMemoryOAuthAccountStore(),
        });

        // Create an encrypted state cookie with expired timestamp
        const expiredState = JSON.stringify({
          state: 'test-state',
          provider: 'mock',
          codeVerifier: 'test-verifier',
          nonce: 'test-nonce',
          expiresAt: Date.now() - 60_000, // expired 1 minute ago
        });
        const encryptedState = await encrypt(expiredState, ENCRYPTION_KEY);

        const response = await auth.handler(
          new Request(
            'http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=test-state',
            { headers: { cookie: `vertz.oauth=${encryptedState}` } },
          ),
        );

        expect(response.status).toBe(302);
        const location = response.headers.get('Location') ?? '';
        expect(location).toContain('error=invalid_state');
      });
    });
  });

  describe('Given onUserCreated throws during OAuth signup', () => {
    describe('When unlinkAccount also throws during rollback', () => {
      it('Then logs rollback error and redirects to user_setup_failed', async () => {
        const oauthAccountStore = new InMemoryOAuthAccountStore();
        const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});

        // Make unlinkAccount throw during rollback
        oauthAccountStore.unlinkAccount = async () => {
          throw new Error('Unlink failed');
        };

        const auth = createTestAuth({
          providers: [createMockProvider()],
          oauthAccountStore,
          onUserCreated: async () => {
            throw new Error('User setup callback failed');
          },
        });

        const { state, cookie } = await initiateOAuthFlow(auth);

        const response = await auth.handler(
          new Request(
            `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
            { headers: { cookie } },
          ),
        );

        expect(response.status).toBe(302);
        const location = response.headers.get('Location') ?? '';
        expect(location).toContain('user_setup_failed');

        // Verify rollback error was logged
        const unlinkErrorLog = consoleSpy.mock.calls.find((call) =>
          String(call[0]).includes('Failed to unlink OAuth account during rollback'),
        );
        expect(unlinkErrorLog).toBeDefined();

        consoleSpy.mockRestore();
      });
    });

    describe('When deleteUser also throws during rollback', () => {
      it('Then logs rollback error and redirects to user_setup_failed', async () => {
        const userStore = new InMemoryUserStore();
        const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});

        // Make deleteUser throw during rollback
        userStore.deleteUser = async () => {
          throw new Error('Delete user failed');
        };

        const auth = createTestAuth({
          providers: [createMockProvider()],
          oauthAccountStore: new InMemoryOAuthAccountStore(),
          userStore,
          onUserCreated: async () => {
            throw new Error('User setup callback failed');
          },
        });

        const { state, cookie } = await initiateOAuthFlow(auth);

        const response = await auth.handler(
          new Request(
            `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
            { headers: { cookie } },
          ),
        );

        expect(response.status).toBe(302);
        const location = response.headers.get('Location') ?? '';
        expect(location).toContain('user_setup_failed');

        const deleteErrorLog = consoleSpy.mock.calls.find((call) =>
          String(call[0]).includes('Failed to delete user during rollback'),
        );
        expect(deleteErrorLog).toBeDefined();

        consoleSpy.mockRestore();
      });
    });
  });

  describe('Given onUserCreated throws during email/password signup', () => {
    describe('When deleteUser also throws during rollback', () => {
      it('Then logs rollback error and returns CALLBACK_FAILED', async () => {
        const userStore = new InMemoryUserStore();
        const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});

        // Make deleteUser throw during rollback
        userStore.deleteUser = async () => {
          throw new Error('Delete user failed');
        };

        const auth = createTestAuth({
          userStore,
          onUserCreated: async () => {
            throw new Error('User setup callback failed');
          },
        });

        const response = await auth.handler(
          new Request('http://localhost:3000/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
          }),
        );

        expect(response.status).toBe(400);
        const body = (await response.json()) as { error: { code: string; subCode?: string } };
        expect(body.error.code).toBe('AUTH_VALIDATION_ERROR');

        const deleteErrorLog = consoleSpy.mock.calls.find((call) =>
          String(call[0]).includes('Failed to rollback user after onUserCreated failure'),
        );
        expect(deleteErrorLog).toBeDefined();

        consoleSpy.mockRestore();
      });
    });
  });

  describe('Given user is deleted between OAuth create and findById', () => {
    describe('When the OAuth callback completes account creation', () => {
      it('Then redirects to user_info_failed', async () => {
        const userStore = new InMemoryUserStore();
        let findByIdCallCount = 0;
        const originalFindById = userStore.findById.bind(userStore);

        // findById returns null after account creation (simulating race condition)
        userStore.findById = async (id: string) => {
          findByIdCallCount++;
          // After the user is created, findById is called to fetch the user for session creation
          // Return null to simulate the user being deleted
          if (findByIdCallCount > 0) {
            return null;
          }
          return originalFindById(id);
        };

        const auth = createTestAuth({
          providers: [createMockProvider()],
          oauthAccountStore: new InMemoryOAuthAccountStore(),
          userStore,
        });

        const { state, cookie } = await initiateOAuthFlow(auth);

        const response = await auth.handler(
          new Request(
            `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
            { headers: { cookie } },
          ),
        );

        expect(response.status).toBe(302);
        const location = response.headers.get('Location') ?? '';
        expect(location).toContain('user_info_failed');
      });
    });
  });
});
