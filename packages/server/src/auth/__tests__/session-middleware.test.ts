import { describe, expect, it } from '@vertz/test';
import { ok } from '@vertz/errors';
import { createAuthSessionMiddleware } from '../session-middleware';
import type { AuthApi, AuthUser, Session, SessionPayload } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubAuthApi(sessionResult: ReturnType<AuthApi['getSession']>): AuthApi {
  return {
    getSession: () => sessionResult,
    signUp: () => {
      throw new Error('stub');
    },
    signIn: () => {
      throw new Error('stub');
    },
    signOut: () => {
      throw new Error('stub');
    },
    refreshSession: () => {
      throw new Error('stub');
    },
    listSessions: () => {
      throw new Error('stub');
    },
    revokeSession: () => {
      throw new Error('stub');
    },
    revokeAllSessions: () => {
      throw new Error('stub');
    },
  };
}

function makeUser(overrides?: Partial<AuthUser>): AuthUser {
  return {
    id: 'user-1',
    email: 'test@example.com',
    role: 'user',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePayload(overrides?: Partial<SessionPayload>): SessionPayload {
  return {
    sub: 'user-1',
    email: 'test@example.com',
    role: 'user',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: 'jwt-1',
    sid: 'session-1',
    ...overrides,
  };
}

function makeSession(user?: Partial<AuthUser>, payload?: Partial<SessionPayload>): Session {
  return {
    user: makeUser(user),
    expiresAt: new Date(Date.now() + 3600000),
    payload: makePayload(payload),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAuthSessionMiddleware', () => {
  describe('Given no raw headers in context', () => {
    it('returns empty object', async () => {
      const api = stubAuthApi(Promise.resolve(ok(null)));
      const mw = createAuthSessionMiddleware(api);

      const result = await mw.handler({});
      expect(result).toEqual({});
    });
  });

  describe('Given raw headers but no valid session', () => {
    it('returns empty object', async () => {
      const api = stubAuthApi(Promise.resolve(ok(null)));
      const mw = createAuthSessionMiddleware(api);

      const result = await mw.handler({
        raw: { headers: new Headers() },
      });
      expect(result).toEqual({});
    });
  });

  describe('Given a valid session without tenantId', () => {
    it('returns userId, null tenantId, and roles', async () => {
      const session = makeSession();
      const api = stubAuthApi(Promise.resolve(ok(session)));
      const mw = createAuthSessionMiddleware(api);

      const result = await mw.handler({
        raw: { headers: new Headers({ Cookie: 'vertz.sid=fake-jwt' }) },
      });

      expect(result).toEqual({
        userId: 'user-1',
        tenantId: null,
        roles: ['user'],
        user: session.user,
        session,
      });
    });
  });

  describe('Given a valid session with tenantId', () => {
    it('returns tenantId from JWT payload', async () => {
      const session = makeSession({}, { tenantId: 'tenant-abc' });
      const api = stubAuthApi(Promise.resolve(ok(session)));
      const mw = createAuthSessionMiddleware(api);

      const result = await mw.handler({
        raw: { headers: new Headers({ Cookie: 'vertz.sid=fake-jwt' }) },
      });

      expect(result).toEqual({
        userId: 'user-1',
        tenantId: 'tenant-abc',
        roles: ['user'],
        user: session.user,
        session,
      });
    });
  });

  describe('Given a session with admin role', () => {
    it('returns the correct role in roles array', async () => {
      const session = makeSession({ role: 'admin' }, { role: 'admin' });
      const api = stubAuthApi(Promise.resolve(ok(session)));
      const mw = createAuthSessionMiddleware(api);

      const result = await mw.handler({
        raw: { headers: new Headers({ Cookie: 'vertz.sid=fake-jwt' }) },
      });

      expect(result).toEqual({
        userId: 'user-1',
        tenantId: null,
        roles: ['admin'],
        user: session.user,
        session,
      });
    });
  });

  it('has name "vertz-auth-session"', () => {
    const api = stubAuthApi(Promise.resolve(ok(null)));
    const mw = createAuthSessionMiddleware(api);
    expect(mw.name).toBe('vertz-auth-session');
  });
});
