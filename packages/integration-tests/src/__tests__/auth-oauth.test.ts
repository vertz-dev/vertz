/**
 * Integration Test: OAuth Providers
 * Uses @vertz/server public imports only — validates the OAuth lifecycle end-to-end.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type {
  AuthConfig,
  AuthInstance,
  OAuthAccountStore,
  OAuthProvider,
  OAuthProviderConfig,
  OAuthTokens,
  OAuthUserInfo,
} from '@vertz/server';
import { createAuth, InMemoryOAuthAccountStore, InMemoryUserStore } from '@vertz/server';

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

function createTestAuth(overrides?: Partial<AuthConfig>): AuthInstance {
  return createAuth({
    session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
    jwtSecret: 'integration-test-secret-at-least-32-chars!!',
    isProduction: false,
    oauthEncryptionKey: 'test-oauth-encryption-key-at-least-32!',
    oauthCallbackUrl: 'http://localhost:3000',
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

async function initiateAndGetState(
  auth: AuthInstance,
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

describe('OAuth Providers (Integration)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({}));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('full OAuth flow: initiate → callback → session created with dual tokens', async () => {
    const auth = createTestAuth({
      providers: [createMockProvider()],
      oauthAccountStore: new InMemoryOAuthAccountStore(),
    });

    // 1. Initiate — should redirect with state cookie
    const initiateRes = await auth.handler(
      new Request('http://localhost:3000/api/auth/oauth/mock'),
    );
    expect(initiateRes.status).toBe(302);
    expect(initiateRes.headers.get('Location')).toContain('https://mock-provider.com/auth');

    // 2. Callback — should create session with dual tokens
    const { state, cookie } = await initiateAndGetState(auth);
    const callbackRes = await auth.handler(
      new Request(
        `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
        { headers: { cookie } },
      ),
    );
    expect(callbackRes.status).toBe(302);

    const cookies = parseCookies(callbackRes);
    expect(cookies['vertz.sid']).toBeDefined();
    expect(cookies['vertz.ref']).toBeDefined();

    // 3. Verify session works — use JWT to get session
    const sessionRes = await auth.handler(
      new Request('http://localhost:3000/api/auth/session', {
        method: 'GET',
        headers: { cookie: `vertz.sid=${cookies['vertz.sid']}` },
      }),
    );
    expect(sessionRes.status).toBe(200);
    const sessionBody = (await sessionRes.json()) as {
      session: { user: { email: string } };
    };
    expect(sessionBody.session?.user?.email).toBe('oauth@example.com');
  });

  it('OAuth account linking: existing OAuth link → sign in as linked user', async () => {
    const oauthAccountStore = new InMemoryOAuthAccountStore();
    const userStore = new InMemoryUserStore();

    // Pre-create user and link
    await userStore.createUser(
      {
        id: 'linked-user',
        email: 'linked@example.com',
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      null,
    );
    await oauthAccountStore.linkAccount('linked-user', 'mock', 'mock-provider-id-123');

    const auth = createTestAuth({
      providers: [createMockProvider()],
      oauthAccountStore,
      userStore,
    });

    const { state, cookie } = await initiateAndGetState(auth);
    const callbackRes = await auth.handler(
      new Request(
        `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
        { headers: { cookie } },
      ),
    );

    expect(callbackRes.status).toBe(302);
    const cookies = parseCookies(callbackRes);
    expect(cookies['vertz.sid']).toBeDefined();
  });

  it('trusted provider auto-links by verified email', async () => {
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
    const callbackRes = await auth.handler(
      new Request(
        `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
        { headers: { cookie } },
      ),
    );

    expect(callbackRes.status).toBe(302);
    // Verify the account was linked
    const linked = await oauthAccountStore.findByProviderAccount('mock', 'mock-provider-id-123');
    expect(linked).toBe('email-user');
  });

  it('untrusted provider creates new account even with matching email', async () => {
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
    const callbackRes = await auth.handler(
      new Request(
        `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
        { headers: { cookie } },
      ),
    );

    expect(callbackRes.status).toBe(302);
    const linked = await oauthAccountStore.findByProviderAccount('mock', 'mock-provider-id-123');
    expect(linked).not.toBeNull();
    expect(linked).not.toBe('email-user');
  });

  it('OAuth-only user cannot sign in with email/password', async () => {
    const oauthAccountStore = new InMemoryOAuthAccountStore();
    const userStore = new InMemoryUserStore();

    const auth = createTestAuth({
      providers: [createMockProvider()],
      oauthAccountStore,
      userStore,
    });

    // Create user via OAuth
    const { state, cookie } = await initiateAndGetState(auth);
    await auth.handler(
      new Request(
        `http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=${state}`,
        { headers: { cookie } },
      ),
    );

    // Try email/password sign in — should fail
    const signInRes = await auth.handler(
      new Request('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'oauth@example.com', password: 'any-password' }),
      }),
    );
    expect(signInRes.status).toBe(401);
  });

  it('multiple providers can be linked to same account', async () => {
    const oauthAccountStore = new InMemoryOAuthAccountStore();
    const userStore = new InMemoryUserStore();

    // Pre-create user with matching email
    await userStore.createUser(
      {
        id: 'multi-user',
        email: 'oauth@example.com',
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      null,
    );

    // Link first provider
    await oauthAccountStore.linkAccount('multi-user', 'mock', 'mock-provider-id-123');

    // Link second provider manually
    await oauthAccountStore.linkAccount('multi-user', 'github', 'gh-user-456');

    // Verify both links exist
    const links = await oauthAccountStore.findByUserId('multi-user');
    expect(links.length).toBe(2);
    expect(links.some((l) => l.provider === 'mock')).toBe(true);
    expect(links.some((l) => l.provider === 'github')).toBe(true);
  });

  it('invalid state in callback → error redirect', async () => {
    const auth = createTestAuth({
      providers: [createMockProvider()],
      oauthAccountStore: new InMemoryOAuthAccountStore(),
    });

    const { cookie } = await initiateAndGetState(auth);
    const callbackRes = await auth.handler(
      new Request(
        'http://localhost:3000/api/auth/oauth/mock/callback?code=auth-code&state=wrong-state',
        { headers: { cookie } },
      ),
    );

    expect(callbackRes.status).toBe(302);
    const location = callbackRes.headers.get('Location') ?? '';
    expect(location).toContain('/auth/error');
    expect(location).toContain('error=invalid_state');
  });
});
