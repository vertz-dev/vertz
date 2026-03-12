import { describe, it } from 'bun:test';
import { InMemoryRateLimitStore } from '../rate-limit-store';
import { InMemorySessionStore } from '../session-store';
import type {
  AuthConfig,
  OAuthAccountStore,
  OAuthProvider,
  OAuthProviderConfig,
  OAuthTokens,
  OAuthUserInfo,
  RateLimitStore,
  SessionPayload,
  SessionStore,
  SignUpInput,
  UserStore,
} from '../types';
import { InMemoryUserStore } from '../user-store';

describe('Type-level tests', () => {
  it('SessionStore interface accepts InMemorySessionStore', () => {
    const _store: SessionStore = new InMemorySessionStore();
    _store.dispose();
  });

  it('RateLimitStore interface accepts InMemoryRateLimitStore', () => {
    const _store: RateLimitStore = new InMemoryRateLimitStore();
    _store.dispose();
  });

  it('UserStore interface accepts InMemoryUserStore', () => {
    const _store: UserStore = new InMemoryUserStore();
  });

  it('AuthConfig accepts sessionStore, rateLimitStore, userStore fields', () => {
    const _config: AuthConfig = {
      session: { strategy: 'jwt', ttl: '60s' },
      sessionStore: new InMemorySessionStore(),
      rateLimitStore: new InMemoryRateLimitStore(),
      userStore: new InMemoryUserStore(),
    };
  });

  it('SessionPayload requires jti and sid', () => {
    const _payload: SessionPayload = {
      sub: 'user-1',
      email: 'test@example.com',
      role: 'user',
      iat: 1000,
      exp: 2000,
      jti: 'jwt-id',
      sid: 'session-id',
    };
  });

  it('AuthConfig rejects wrong store type', () => {
    // @ts-expect-error — sessionStore must implement SessionStore interface
    const _config: AuthConfig = {
      session: { strategy: 'jwt', ttl: '60s' },
      sessionStore: { invalid: true },
    };
  });

  it('SessionPayload without jti is incomplete', () => {
    // @ts-expect-error — jti is required on SessionPayload
    const _payload: SessionPayload = {
      sub: 'user-1',
      email: 'test@example.com',
      role: 'user',
      iat: 1000,
      exp: 2000,
      sid: 'session-id',
    };
  });

  it('OAuthProvider interface is structurally correct', () => {
    const _provider: OAuthProvider = {
      id: 'google',
      name: 'Google',
      scopes: ['openid', 'email'],
      trustEmail: true,
      getAuthorizationUrl: (_state: string, _codeChallenge?: string, _nonce?: string) =>
        'https://accounts.google.com/o/oauth2/v2/auth',
      exchangeCode: async (_code: string, _codeVerifier?: string) => ({
        accessToken: 'token',
      }),
      getUserInfo: async (_accessToken: string, _idToken?: string) => ({
        providerId: '123',
        email: 'user@example.com',
        emailVerified: true,
        raw: { sub: '123' },
      }),
      mapProfile: (_raw) => ({ name: 'User' }),
    };
  });

  it('AuthConfig accepts providers array', () => {
    const provider: OAuthProvider = {
      id: 'google',
      name: 'Google',
      scopes: ['openid'],
      trustEmail: true,
      getAuthorizationUrl: () => 'https://example.com',
      exchangeCode: async () => ({ accessToken: 'tok' }),
      getUserInfo: async () => ({ providerId: '1', email: 'a@b.c', emailVerified: true, raw: {} }),
      mapProfile: (_raw) => ({ name: 'User' }),
    };
    const _config: AuthConfig = {
      session: { strategy: 'jwt', ttl: '60s' },
      providers: [provider],
    };
  });

  it('AuthConfig accepts oauthAccountStore', () => {
    const _config: AuthConfig = {
      session: { strategy: 'jwt', ttl: '60s' },
      oauthAccountStore: {
        linkAccount: async () => {},
        findByProviderAccount: async () => null,
        findByUserId: async () => [],
        unlinkAccount: async () => {},
        dispose: () => {},
      } satisfies OAuthAccountStore,
    };
  });

  it('AuthConfig rejects wrong provider type', () => {
    // @ts-expect-error — providers must be OAuthProvider[], not random objects
    const _config: AuthConfig = {
      session: { strategy: 'jwt', ttl: '60s' },
      providers: [{ notAProvider: true }],
    };
  });

  it('UserStore.createUser accepts null passwordHash', () => {
    const store = new InMemoryUserStore();
    // null passwordHash should be accepted for OAuth-only users
    store.createUser(
      {
        id: '1',
        email: 'a@b.c',
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      null,
    );
  });

  it('SignUpInput rejects framework-owned role field', () => {
    // @ts-expect-error — public sign-up cannot self-assign framework roles
    const _input: SignUpInput = {
      email: 'user@example.com',
      password: 'Password123!',
      role: 'admin',
    };
  });

  it('OAuthProvider without trustEmail is incomplete', () => {
    // @ts-expect-error — trustEmail is required on OAuthProvider
    const _provider: OAuthProvider = {
      id: 'google',
      name: 'Google',
      scopes: ['openid'],
      getAuthorizationUrl: () => 'https://example.com',
      exchangeCode: async () => ({ accessToken: 'tok' }),
      getUserInfo: async () => ({ providerId: '1', email: 'a@b.c', emailVerified: true, raw: {} }),
      mapProfile: (_raw) => ({}),
    };
  });

  it('OAuthTokens interface is correct', () => {
    const _tokens: OAuthTokens = {
      accessToken: 'access',
    };
    const _tokensWithOptional: OAuthTokens = {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 3600,
      idToken: 'id-token',
    };
  });

  it('OAuthUserInfo interface requires raw field', () => {
    const _info: OAuthUserInfo = {
      providerId: '123',
      email: 'user@example.com',
      emailVerified: true,
      raw: { id: 123 },
    };
  });

  it('OAuthUserInfo accepts optional name and avatarUrl', () => {
    const _info: OAuthUserInfo = {
      providerId: '123',
      email: 'user@example.com',
      emailVerified: true,
      name: 'User',
      avatarUrl: 'https://example.com/avatar.png',
      raw: { id: 123, login: 'octocat' },
    };
  });

  it('OAuthUserInfo without raw is incomplete', () => {
    // @ts-expect-error — raw is required on OAuthUserInfo
    const _info: OAuthUserInfo = {
      providerId: '123',
      email: 'user@example.com',
      emailVerified: true,
    };
  });

  it('OAuthProviderConfig interface is correct', () => {
    const _config: OAuthProviderConfig = {
      clientId: 'id',
      clientSecret: 'secret',
    };
    const _configFull: OAuthProviderConfig = {
      clientId: 'id',
      clientSecret: 'secret',
      redirectUrl: 'https://example.com/callback',
      scopes: ['openid'],
    };
  });

  it('OAuthProviderConfig accepts mapProfile with typed profile', () => {
    interface TestProfile {
      id: number;
      login: string;
      name: string | null;
    }
    const _config: OAuthProviderConfig<TestProfile> = {
      clientId: 'id',
      clientSecret: 'secret',
      mapProfile: (profile) => ({
        name: profile.name ?? profile.login,
      }),
    };
  });

  it('OAuthProvider requires mapProfile field', () => {
    // @ts-expect-error — mapProfile is required on OAuthProvider
    const _provider: OAuthProvider = {
      id: 'test',
      name: 'Test',
      scopes: ['openid'],
      trustEmail: true,
      getAuthorizationUrl: () => 'https://example.com',
      exchangeCode: async () => ({ accessToken: 'tok' }),
      getUserInfo: async () => ({
        providerId: '1',
        email: 'a@b.c',
        emailVerified: true,
        raw: {},
      }),
    };
  });

  it('OAuthProvider with mapProfile is structurally correct', () => {
    const _provider: OAuthProvider = {
      id: 'test',
      name: 'Test',
      scopes: ['openid'],
      trustEmail: true,
      getAuthorizationUrl: () => 'https://example.com',
      exchangeCode: async () => ({ accessToken: 'tok' }),
      getUserInfo: async () => ({
        providerId: '1',
        email: 'a@b.c',
        emailVerified: true,
        raw: {},
      }),
      mapProfile: (raw) => ({ name: raw.name as string }),
    };
  });
});
