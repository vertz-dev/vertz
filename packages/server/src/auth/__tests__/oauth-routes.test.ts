/**
 * OAuth Routes Tests — Sub-Phase 4
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createAuth } from '../index';
import { InMemoryOAuthAccountStore } from '../oauth-account-store';
import type { AuthConfig, OAuthProvider } from '../types';
import { InMemoryUserStore } from '../user-store';

function createMockProvider(overrides?: Partial<OAuthProvider>): OAuthProvider {
  return {
    id: 'mock',
    name: 'Mock',
    scopes: ['openid', 'email'],
    trustEmail: false,
    getAuthorizationUrl: (state: string, codeChallenge?: string) => {
      const params = new URLSearchParams({
        client_id: 'mock-client',
        state,
      });
      if (codeChallenge) params.set('code_challenge', codeChallenge);
      return `https://mock-provider.com/auth?${params.toString()}`;
    },
    exchangeCode: async () => ({
      accessToken: 'mock-access-token',
    }),
    getUserInfo: async () => ({
      providerId: 'mock-provider-id-123',
      email: 'oauth@example.com',
      emailVerified: true,
      name: 'OAuth User',
    }),
    ...overrides,
  };
}

function createTestAuth(overrides?: Partial<AuthConfig>): ReturnType<typeof createAuth> {
  return createAuth({
    session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
    jwtSecret: 'oauth-test-secret-at-least-32-characters!!',
    isProduction: false,
    oauthEncryptionKey: 'test-oauth-encryption-key-at-least-32!',

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

describe('OAuth Routes', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Default mock: exchange code returns tokens, getUserInfo returns user
    globalThis.fetch = async () => new Response(JSON.stringify({}));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('GET /oauth/:provider (initiate)', () => {
    it('redirects to authorization URL', async () => {
      const auth = createTestAuth({
        providers: [createMockProvider()],
        oauthAccountStore: new InMemoryOAuthAccountStore(),
      });

      const response = await auth.handler(new Request('http://localhost:3000/api/auth/oauth/mock'));

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('https://mock-provider.com/auth');
      expect(location).toContain('state=');
    });

    it('sets encrypted vertz.oauth cookie', async () => {
      const auth = createTestAuth({
        providers: [createMockProvider()],
        oauthAccountStore: new InMemoryOAuthAccountStore(),
      });

      const response = await auth.handler(new Request('http://localhost:3000/api/auth/oauth/mock'));

      const setCookie = response.headers.getSetCookie();
      const oauthCookie = setCookie.find((c) => c.startsWith('vertz.oauth='));
      expect(oauthCookie).toBeDefined();
      expect(oauthCookie).toContain('HttpOnly');
      expect(oauthCookie).toContain('Max-Age=300');
    });

    it('returns 404 for unconfigured provider', async () => {
      const auth = createTestAuth({
        providers: [createMockProvider()],
        oauthAccountStore: new InMemoryOAuthAccountStore(),
      });

      const response = await auth.handler(
        new Request('http://localhost:3000/api/auth/oauth/unknown'),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('GET /oauth/:provider/callback', () => {
    async function initiateAndGetState(
      auth: ReturnType<typeof createAuth>,
      providerId = 'mock',
    ): Promise<{ state: string; cookie: string }> {
      const initiateResponse = await auth.handler(
        new Request(`http://localhost:3000/api/auth/oauth/${providerId}`),
      );

      const location = initiateResponse.headers.get('Location') ?? '';
      const stateParam = new URL(location).searchParams.get('state') ?? '';
      const setCookie = initiateResponse.headers.getSetCookie();
      const oauthCookie = setCookie.find((c) => c.startsWith('vertz.oauth='));
      const cookieValue = oauthCookie?.split(';')[0] ?? '';

      return { state: stateParam, cookie: cookieValue };
    }

    it('with valid code creates session', async () => {
      const auth = createTestAuth({
        providers: [createMockProvider()],
        oauthAccountStore: new InMemoryOAuthAccountStore(),
      });

      const { state, cookie } = await initiateAndGetState(auth);

      const callbackResponse = await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
          { headers: { cookie } },
        ),
      );

      expect(callbackResponse.status).toBe(302);
    });

    it('sets vertz.sid and vertz.ref cookies', async () => {
      const auth = createTestAuth({
        providers: [createMockProvider()],
        oauthAccountStore: new InMemoryOAuthAccountStore(),
      });

      const { state, cookie } = await initiateAndGetState(auth);

      const callbackResponse = await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
          { headers: { cookie } },
        ),
      );

      const cookies = parseCookies(callbackResponse);
      expect(cookies['vertz.sid']).toBeDefined();
      expect(cookies['vertz.ref']).toBeDefined();
    });

    it('redirects to success URL', async () => {
      const auth = createTestAuth({
        providers: [createMockProvider()],
        oauthAccountStore: new InMemoryOAuthAccountStore(),
        oauthSuccessRedirect: '/dashboard',
      });

      const { state, cookie } = await initiateAndGetState(auth);

      const callbackResponse = await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
          { headers: { cookie } },
        ),
      );

      expect(callbackResponse.headers.get('Location')).toBe('/dashboard');
    });

    it('with invalid state redirects to error URL', async () => {
      const auth = createTestAuth({
        providers: [createMockProvider()],
        oauthAccountStore: new InMemoryOAuthAccountStore(),
      });

      // Initiate to get a valid cookie, but use a different state
      const { cookie } = await initiateAndGetState(auth);

      const callbackResponse = await auth.handler(
        new Request(
          'http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=wrong-state',
          { headers: { cookie } },
        ),
      );

      expect(callbackResponse.status).toBe(302);
      const location = callbackResponse.headers.get('Location') ?? '';
      expect(location).toContain('/auth/error');
      expect(location).toContain('error=invalid_state');
    });

    it('with missing cookie redirects to error URL', async () => {
      const auth = createTestAuth({
        providers: [createMockProvider()],
        oauthAccountStore: new InMemoryOAuthAccountStore(),
      });

      const callbackResponse = await auth.handler(
        new Request(
          'http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=some-state',
        ),
      );

      expect(callbackResponse.status).toBe(302);
      const location = callbackResponse.headers.get('Location') ?? '';
      expect(location).toContain('/auth/error');
    });

    it('with existing OAuth link signs in as linked user', async () => {
      const oauthAccountStore = new InMemoryOAuthAccountStore();
      const userStore = new InMemoryUserStore();

      // Pre-create a user and link
      await userStore.createUser(
        {
          id: 'existing-user',
          email: 'existing@example.com',
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        null,
      );
      await oauthAccountStore.linkAccount('existing-user', 'mock', 'mock-provider-id-123');

      const auth = createTestAuth({
        providers: [createMockProvider()],
        oauthAccountStore,
        userStore,
      });

      const { state, cookie } = await initiateAndGetState(auth);

      const callbackResponse = await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
          { headers: { cookie } },
        ),
      );

      expect(callbackResponse.status).toBe(302);
      const cookies = parseCookies(callbackResponse);
      expect(cookies['vertz.sid']).toBeDefined();
    });

    it('with trusted provider auto-links by verified email', async () => {
      const oauthAccountStore = new InMemoryOAuthAccountStore();
      const userStore = new InMemoryUserStore();

      // Pre-create a user with matching email
      await userStore.createUser(
        {
          id: 'email-user',
          email: 'oauth@example.com',
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        'hashed-password',
      );

      const auth = createTestAuth({
        providers: [createMockProvider({ trustEmail: true })],
        oauthAccountStore,
        userStore,
      });

      const { state, cookie } = await initiateAndGetState(auth);

      const callbackResponse = await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
          { headers: { cookie } },
        ),
      );

      expect(callbackResponse.status).toBe(302);
      // Verify the account was linked
      const linked = await oauthAccountStore.findByProviderAccount('mock', 'mock-provider-id-123');
      expect(linked).toBe('email-user');
    });

    it('with untrusted provider creates new account', async () => {
      const oauthAccountStore = new InMemoryOAuthAccountStore();
      const userStore = new InMemoryUserStore();

      // Pre-create a user with matching email
      await userStore.createUser(
        {
          id: 'email-user',
          email: 'oauth@example.com',
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        'hashed-password',
      );

      const auth = createTestAuth({
        providers: [createMockProvider({ trustEmail: false })],
        oauthAccountStore,
        userStore,
      });

      const { state, cookie } = await initiateAndGetState(auth);

      const callbackResponse = await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
          { headers: { cookie } },
        ),
      );

      expect(callbackResponse.status).toBe(302);
      // Verify a NEW account was linked (not the existing one)
      const linked = await oauthAccountStore.findByProviderAccount('mock', 'mock-provider-id-123');
      expect(linked).not.toBeNull();
      expect(linked).not.toBe('email-user');
    });

    it('creates OAuth account link in store', async () => {
      const oauthAccountStore = new InMemoryOAuthAccountStore();

      const auth = createTestAuth({
        providers: [createMockProvider()],
        oauthAccountStore,
      });

      const { state, cookie } = await initiateAndGetState(auth);

      await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
          { headers: { cookie } },
        ),
      );

      const linked = await oauthAccountStore.findByProviderAccount('mock', 'mock-provider-id-123');
      expect(linked).not.toBeNull();
    });

    it('OAuth-created user has null passwordHash', async () => {
      const oauthAccountStore = new InMemoryOAuthAccountStore();
      const userStore = new InMemoryUserStore();

      const auth = createTestAuth({
        providers: [createMockProvider()],
        oauthAccountStore,
        userStore,
      });

      const { state, cookie } = await initiateAndGetState(auth);

      await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
          { headers: { cookie } },
        ),
      );

      const found = await userStore.findByEmail('oauth@example.com');
      expect(found).not.toBeNull();
      expect(found?.passwordHash).toBeNull();
    });

    it('callback includes Cache-Control: no-store', async () => {
      const auth = createTestAuth({
        providers: [createMockProvider()],
        oauthAccountStore: new InMemoryOAuthAccountStore(),
      });

      const { state, cookie } = await initiateAndGetState(auth);

      const callbackResponse = await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
          { headers: { cookie } },
        ),
      );

      expect(callbackResponse.headers.get('Cache-Control')).toContain('no-store');
    });

    it('with provider error (access_denied) redirects with provider error', async () => {
      const auth = createTestAuth({
        providers: [createMockProvider()],
        oauthAccountStore: new InMemoryOAuthAccountStore(),
      });

      const { state, cookie } = await initiateAndGetState(auth);

      const callbackResponse = await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/oauth/mock/callback?error=access_denied&state=${state}`,
          { headers: { cookie } },
        ),
      );

      expect(callbackResponse.status).toBe(302);
      const location = callbackResponse.headers.get('Location') ?? '';
      expect(location).toContain('error=access_denied');
    });

    it('with empty email from provider redirects to error', async () => {
      const auth = createTestAuth({
        providers: [
          createMockProvider({
            getUserInfo: async () => ({
              providerId: 'mock-provider-id-456',
              email: '',
              emailVerified: false,
              name: 'No Email User',
            }),
          }),
        ],
        oauthAccountStore: new InMemoryOAuthAccountStore(),
      });

      const { state, cookie } = await initiateAndGetState(auth);

      const callbackResponse = await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
          { headers: { cookie } },
        ),
      );

      expect(callbackResponse.status).toBe(302);
      const location = callbackResponse.headers.get('Location') ?? '';
      expect(location).toContain('error=email_required');
    });
  });

  describe('OAuth rate limiting', () => {
    it('returns 429 after 10 initiations', async () => {
      const auth = createTestAuth({
        providers: [createMockProvider()],
        oauthAccountStore: new InMemoryOAuthAccountStore(),
      });

      // Make 10 requests (should all succeed)
      for (let i = 0; i < 10; i++) {
        const res = await auth.handler(new Request('http://localhost:3000/api/auth/oauth/mock'));
        expect(res.status).toBe(302);
      }

      // 11th should be rate limited
      const res = await auth.handler(new Request('http://localhost:3000/api/auth/oauth/mock'));
      expect(res.status).toBe(429);
    });
  });
});
