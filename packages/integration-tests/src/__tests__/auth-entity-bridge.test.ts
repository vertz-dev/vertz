/**
 * Integration Test: Auth-Entity Bridge via onUserCreated
 * Uses @vertz/server public imports only — validates the full lifecycle:
 * auth sign-up → onUserCreated callback → entity population → rollback on failure.
 */

import { describe, expect, it } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import type {
  AuthCallbackContext,
  AuthConfig,
  AuthEntityProxy,
  AuthInstance,
  OAuthProvider,
  OnUserCreatedPayload,
} from '@vertz/server';
import { createAuth, InMemoryOAuthAccountStore, InMemoryUserStore } from '@vertz/server';

const { publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockProvider(overrides?: Partial<OAuthProvider>): OAuthProvider {
  return {
    id: 'github',
    name: 'GitHub',
    scopes: ['read:user', 'user:email'],
    trustEmail: false,
    getAuthorizationUrl: (state: string) => {
      const params = new URLSearchParams({ client_id: 'mock-client', state });
      return `https://github.com/login/oauth/authorize?${params.toString()}`;
    },
    exchangeCode: async () => ({
      accessToken: 'mock-access-token',
    }),
    getUserInfo: async () => ({
      providerId: 'gh-123456',
      email: 'dev@example.com',
      emailVerified: true,
      raw: {
        id: 123456,
        login: 'devuser',
        name: 'Dev User',
        avatar_url: 'https://github.com/avatars/dev.png',
        bio: 'Open source contributor',
      },
    }),
    ...overrides,
  };
}

function createTestAuth(overrides?: Partial<AuthConfig>): AuthInstance {
  return createAuth({
    session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
    privateKey: TEST_PRIVATE_KEY as string,
    publicKey: TEST_PUBLIC_KEY as string,
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

async function initiateOAuthFlow(auth: AuthInstance): Promise<{ state: string; cookie: string }> {
  const initRes = await auth.handler(
    new Request('http://localhost:3000/api/auth/oauth/github', {
      redirect: 'manual',
    }),
  );
  const location = initRes.headers.get('Location') ?? '';
  const stateParam = new URL(location).searchParams.get('state') ?? '';
  const cookies = parseCookies(initRes);
  const cookieValue = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  return { state: stateParam, cookie: cookieValue };
}

// Simulates an in-memory entity store for the "users" entity
function createMockEntityProxy(): {
  proxy: Record<string, AuthEntityProxy>;
  store: Map<string, Record<string, unknown>>;
} {
  const store = new Map<string, Record<string, unknown>>();
  const proxy: Record<string, AuthEntityProxy> = {
    users: {
      get: async (id: string) => store.get(id) ?? null,
      list: async () => ({ items: [...store.values()], total: store.size }),
      create: async (data: Record<string, unknown>) => {
        store.set(data.id as string, data);
        return data;
      },
      update: async (id: string, data: Record<string, unknown>) => {
        const existing = store.get(id);
        if (!existing) return null;
        const updated = { ...existing, ...data };
        store.set(id, updated);
        return updated;
      },
      delete: async (id: string) => {
        store.delete(id);
      },
    },
  };
  return { proxy, store };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: Auth-entity bridge via onUserCreated', () => {
  describe('Given a server with auth and a users entity', () => {
    describe('When a user signs up via OAuth (GitHub)', () => {
      it('Then onUserCreated fires with provider and profile fields', async () => {
        const userStore = new InMemoryUserStore();
        const oauthAccountStore = new InMemoryOAuthAccountStore();
        let receivedPayload: OnUserCreatedPayload | null = null;

        const auth = createTestAuth({
          providers: [createMockProvider()],
          userStore,
          oauthAccountStore,
          onUserCreated: async (payload) => {
            receivedPayload = payload;
          },
        });

        const { state, cookie } = await initiateOAuthFlow(auth);
        await auth.handler(
          new Request(
            `http://localhost:3000/api/auth/oauth/github/callback?code=auth-code&state=${state}`,
            { headers: { cookie } },
          ),
        );

        expect(receivedPayload).not.toBeNull();
        expect(receivedPayload?.provider).not.toBeNull();
        expect(receivedPayload?.provider?.id).toBe('github');
        expect(receivedPayload?.provider?.name).toBe('GitHub');
        // Profile contains the full raw provider response
        const oauthPayload = receivedPayload as Extract<
          OnUserCreatedPayload,
          { provider: { id: string } }
        >;
        expect(oauthPayload.profile.login).toBe('devuser');
        expect(oauthPayload.profile.avatar_url).toBe('https://github.com/avatars/dev.png');
      });

      it('Then the developer can populate their users entity via ctx.entities', async () => {
        const userStore = new InMemoryUserStore();
        const oauthAccountStore = new InMemoryOAuthAccountStore();
        const { proxy, store } = createMockEntityProxy();

        const auth = createTestAuth({
          providers: [createMockProvider()],
          userStore,
          oauthAccountStore,
          _entityProxy: proxy,
          onUserCreated: async (payload, ctx) => {
            if (payload.provider) {
              const profile = payload.profile as Record<string, unknown>;
              await ctx.entities.users.create({
                id: payload.user.id,
                email: payload.user.email,
                name: (profile.name as string) ?? (profile.login as string),
                avatarUrl: profile.avatar_url as string,
                bio: profile.bio as string,
              });
            }
          },
        });

        const { state, cookie } = await initiateOAuthFlow(auth);
        await auth.handler(
          new Request(
            `http://localhost:3000/api/auth/oauth/github/callback?code=auth-code&state=${state}`,
            { headers: { cookie } },
          ),
        );

        // Entity store should have the user record populated by the callback
        expect(store.size).toBe(1);
        const userRecord = [...store.values()][0];
        expect(userRecord.email).toBe('dev@example.com');
        expect(userRecord.name).toBe('Dev User');
        expect(userRecord.avatarUrl).toBe('https://github.com/avatars/dev.png');
        expect(userRecord.bio).toBe('Open source contributor');
      });

      it('Then auth_users only contains framework fields', async () => {
        const userStore = new InMemoryUserStore();
        const oauthAccountStore = new InMemoryOAuthAccountStore();

        const auth = createTestAuth({
          providers: [createMockProvider()],
          userStore,
          oauthAccountStore,
        });

        const { state, cookie } = await initiateOAuthFlow(auth);
        await auth.handler(
          new Request(
            `http://localhost:3000/api/auth/oauth/github/callback?code=auth-code&state=${state}`,
            { headers: { cookie } },
          ),
        );

        const found = await userStore.findByEmail('dev@example.com');
        expect(found).not.toBeNull();
        const user = found!.user;
        // Framework fields only — no name, no avatarUrl, no custom fields
        expect(user.id).toBeDefined();
        expect(user.email).toBe('dev@example.com');
        expect(user.role).toBe('user');
        expect(user.createdAt).toBeInstanceOf(Date);
        expect(user.updatedAt).toBeInstanceOf(Date);
        // AuthUser is now a closed interface — these properties don't exist
        expect((user as Record<string, unknown>).name).toBeUndefined();
        expect((user as Record<string, unknown>).avatarUrl).toBeUndefined();
      });
    });

    describe('When a user signs up via email/password', () => {
      it('Then onUserCreated fires with provider: null and signUpData', async () => {
        const userStore = new InMemoryUserStore();
        let receivedPayload: OnUserCreatedPayload | null = null;

        const auth = createTestAuth({
          userStore,
          onUserCreated: async (payload) => {
            receivedPayload = payload;
          },
        });

        await auth.handler(
          new Request('http://localhost/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'user@example.com',
              password: 'securePassword123',
              name: 'New User',
              avatarUrl: 'https://example.com/avatar.png',
            }),
          }),
        );

        expect(receivedPayload).not.toBeNull();
        expect(receivedPayload?.provider).toBeNull();
        const emailPayload = receivedPayload as Extract<OnUserCreatedPayload, { provider: null }>;
        expect(emailPayload.signUpData.name).toBe('New User');
        expect(emailPayload.signUpData.avatarUrl).toBe('https://example.com/avatar.png');
        // Reserved fields should NOT be in signUpData
        expect(emailPayload.signUpData).not.toHaveProperty('email');
        expect(emailPayload.signUpData).not.toHaveProperty('password');
        expect(emailPayload.signUpData).not.toHaveProperty('role');
        expect(emailPayload.signUpData).not.toHaveProperty('id');
        expect(emailPayload.signUpData).not.toHaveProperty('createdAt');
        expect(emailPayload.signUpData).not.toHaveProperty('updatedAt');
        expect(emailPayload.signUpData).not.toHaveProperty('plan');
        expect(emailPayload.signUpData).not.toHaveProperty('emailVerified');
      });

      it('Then the developer can populate their users entity via ctx.entities', async () => {
        const userStore = new InMemoryUserStore();
        const { proxy, store } = createMockEntityProxy();

        const auth = createTestAuth({
          userStore,
          _entityProxy: proxy,
          onUserCreated: async (payload, ctx) => {
            if (!payload.provider) {
              await ctx.entities.users.create({
                id: payload.user.id,
                email: payload.user.email,
                name: (payload.signUpData.name as string) ?? null,
              });
            }
          },
        });

        await auth.handler(
          new Request('http://localhost/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'user@example.com',
              password: 'securePassword123',
              name: 'New User',
            }),
          }),
        );

        expect(store.size).toBe(1);
        const userRecord = [...store.values()][0];
        expect(userRecord.email).toBe('user@example.com');
        expect(userRecord.name).toBe('New User');
      });
    });

    describe('When onUserCreated throws', () => {
      it('Then the auth user is rolled back (deleted)', async () => {
        const userStore = new InMemoryUserStore();

        const auth = createTestAuth({
          userStore,
          onUserCreated: async () => {
            throw new Error('Entity creation failed');
          },
        });

        await auth.handler(
          new Request('http://localhost/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'fail@example.com',
              password: 'securePassword123',
            }),
          }),
        );

        // User should not exist — rolled back
        const found = await userStore.findByEmail('fail@example.com');
        expect(found).toBeNull();
      });

      it('Then OAuth flow redirects with error=user_setup_failed', async () => {
        const userStore = new InMemoryUserStore();
        const oauthAccountStore = new InMemoryOAuthAccountStore();

        const auth = createTestAuth({
          providers: [createMockProvider()],
          userStore,
          oauthAccountStore,
          onUserCreated: async () => {
            throw new Error('Entity creation failed');
          },
        });

        const { state, cookie } = await initiateOAuthFlow(auth);
        const res = await auth.handler(
          new Request(
            `http://localhost:3000/api/auth/oauth/github/callback?code=auth-code&state=${state}`,
            { headers: { cookie } },
          ),
        );

        expect(res.status).toBe(302);
        const location = res.headers.get('Location') ?? '';
        expect(location).toContain('error=user_setup_failed');

        // Auth user should be rolled back
        const found = await userStore.findByEmail('dev@example.com');
        expect(found).toBeNull();

        // OAuth account link should be removed
        const accounts = await oauthAccountStore.findByProviderAccount('github', 'gh-123456');
        expect(accounts).toBeNull();
      });

      it('Then email/password flow returns an error result', async () => {
        const userStore = new InMemoryUserStore();

        const auth = createTestAuth({
          userStore,
          onUserCreated: async () => {
            throw new Error('Entity creation failed');
          },
        });

        const res = await auth.handler(
          new Request('http://localhost/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'fail@example.com',
              password: 'securePassword123',
            }),
          }),
        );

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBeDefined();
        expect(body.error.code).toBe('AUTH_VALIDATION_ERROR');
        expect(body.error.constraint).toBe('CALLBACK_FAILED');
      });
    });

    describe('When onUserCreated is not provided', () => {
      it('Then auth works normally without side effects', async () => {
        const userStore = new InMemoryUserStore();

        const auth = createTestAuth({
          userStore,
          // No onUserCreated — auth should work as before
        });

        const res = await auth.handler(
          new Request('http://localhost/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'normal@example.com',
              password: 'securePassword123',
            }),
          }),
        );

        const body = await res.json();
        expect(body.user).toBeDefined();
        expect(body.user.email).toBe('normal@example.com');

        // User exists in auth store
        const found = await userStore.findByEmail('normal@example.com');
        expect(found).not.toBeNull();
      });
    });

    describe('When an existing OAuth user signs in again', () => {
      it('Then onUserCreated does NOT fire (only fires for new users)', async () => {
        const userStore = new InMemoryUserStore();
        const oauthAccountStore = new InMemoryOAuthAccountStore();
        let callbackCount = 0;

        const auth = createTestAuth({
          providers: [createMockProvider()],
          userStore,
          oauthAccountStore,
          onUserCreated: async () => {
            callbackCount++;
          },
        });

        // First sign-up — callback should fire
        const { state: state1, cookie: cookie1 } = await initiateOAuthFlow(auth);
        await auth.handler(
          new Request(
            `http://localhost:3000/api/auth/oauth/github/callback?code=auth-code&state=${state1}`,
            { headers: { cookie: cookie1 } },
          ),
        );
        expect(callbackCount).toBe(1);

        // Second sign-in with same provider account — callback should NOT fire
        const { state: state2, cookie: cookie2 } = await initiateOAuthFlow(auth);
        await auth.handler(
          new Request(
            `http://localhost:3000/api/auth/oauth/github/callback?code=auth-code&state=${state2}`,
            { headers: { cookie: cookie2 } },
          ),
        );
        expect(callbackCount).toBe(1); // Still 1 — not fired again
      });
    });

    describe('When ctx.entities is used in the callback', () => {
      it('Then entity operations work (system-level, bypasses access rules)', async () => {
        const userStore = new InMemoryUserStore();
        const { proxy, store } = createMockEntityProxy();
        let receivedCtx: AuthCallbackContext | null = null;

        const auth = createTestAuth({
          userStore,
          _entityProxy: proxy,
          onUserCreated: async (payload, ctx) => {
            receivedCtx = ctx;
            // Create entity record using system-level access
            await ctx.entities.users.create({
              id: payload.user.id,
              email: payload.user.email,
            });
          },
        });

        await auth.handler(
          new Request('http://localhost/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'sys@example.com',
              password: 'securePassword123',
            }),
          }),
        );

        // ctx.entities was provided
        expect(receivedCtx).not.toBeNull();
        expect(receivedCtx?.entities).toBe(proxy);

        // Entity was created
        expect(store.size).toBe(1);
        const record = [...store.values()][0];
        expect(record.email).toBe('sys@example.com');
      });
    });
  });
});
