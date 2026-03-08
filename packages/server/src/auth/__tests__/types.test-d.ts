import { describe, it } from 'bun:test';
import { InMemoryRateLimitStore } from '../rate-limit-store';
import { InMemorySessionStore } from '../session-store';
import type { AuthConfig, RateLimitStore, SessionPayload, SessionStore, UserStore } from '../types';
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
});
