/**
 * Bearer Token Auth — Tests for Authorization: Bearer <token> support in getSession().
 * Issue: #1658
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { createAuth } from '../index';
import { InMemorySessionStore } from '../session-store';
import type { AuthConfig, AuthInstance } from '../types';
import { InMemoryUserStore } from '../user-store';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestAuth(overrides?: Partial<AuthConfig>): AuthInstance {
  return createAuth({
    session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
    privateKey: TEST_PRIVATE_KEY,
    publicKey: TEST_PUBLIC_KEY,
    isProduction: false,
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

/** Sign up a user and return the raw JWT from the session cookie. */
async function signUpAndGetJwt(auth: AuthInstance, email = 'test@example.com'): Promise<string> {
  const response = await auth.handler(
    new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    }),
  );
  const cookies = parseCookies(response);
  return cookies['vertz.sid'];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: Bearer token auth in getSession()', () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createTestAuth();
  });

  describe('Given a valid JWT in Authorization: Bearer header', () => {
    describe('When getSession is called', () => {
      it('Then returns the session with correct user data', async () => {
        const jwt = await signUpAndGetJwt(auth, 'bearer@test.com');

        const result = await auth.api.getSession(new Headers({ Authorization: `Bearer ${jwt}` }));

        expect(result.ok).toBe(true);
        expect(result.data).not.toBeNull();
        expect(result.data!.user.email).toBe('bearer@test.com');
        expect(result.data!.user.id).toBeDefined();
      });
    });
  });

  describe('Given both a cookie and a Bearer header with different JWTs', () => {
    describe('When getSession is called', () => {
      it('Then cookie takes priority over Bearer', async () => {
        // Create two users to get two different JWTs
        const jwt1 = await signUpAndGetJwt(auth, 'cookie-user@test.com');
        const jwt2 = await signUpAndGetJwt(auth, 'bearer-user@test.com');

        const result = await auth.api.getSession(
          new Headers({
            Cookie: `vertz.sid=${jwt1}`,
            Authorization: `Bearer ${jwt2}`,
          }),
        );

        expect(result.ok).toBe(true);
        expect(result.data).not.toBeNull();
        expect(result.data!.user.email).toBe('cookie-user@test.com');
      });
    });
  });

  describe('Given an Authorization header without Bearer prefix', () => {
    describe('When getSession is called', () => {
      it('Then returns null (unauthenticated)', async () => {
        const result = await auth.api.getSession(new Headers({ Authorization: 'Basic abc123' }));

        expect(result.ok).toBe(true);
        expect(result.data).toBeNull();
      });
    });
  });

  describe('Given an Authorization: Bearer header with an invalid JWT', () => {
    describe('When getSession is called', () => {
      it('Then returns null (unauthenticated)', async () => {
        const result = await auth.api.getSession(
          new Headers({ Authorization: 'Bearer not-a-valid-jwt' }),
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeNull();
      });
    });
  });

  describe('Given an empty Bearer token (Authorization: Bearer )', () => {
    describe('When getSession is called', () => {
      it('Then returns null (unauthenticated)', async () => {
        const result = await auth.api.getSession(new Headers({ Authorization: 'Bearer ' }));

        expect(result.ok).toBe(true);
        expect(result.data).toBeNull();
      });
    });
  });

  describe('Given a whitespace-only Bearer token', () => {
    describe('When getSession is called', () => {
      it('Then returns null (unauthenticated)', async () => {
        const result = await auth.api.getSession(new Headers({ Authorization: 'Bearer    ' }));

        expect(result.ok).toBe(true);
        expect(result.data).toBeNull();
      });
    });
  });

  describe('Given a Bearer token with extra whitespace before the JWT', () => {
    describe('When getSession is called', () => {
      it('Then trims and resolves the token correctly', async () => {
        const jwt = await signUpAndGetJwt(auth, 'trimmed@test.com');

        const result = await auth.api.getSession(new Headers({ Authorization: `Bearer  ${jwt}` }));

        expect(result.ok).toBe(true);
        expect(result.data).not.toBeNull();
        expect(result.data!.user.email).toBe('trimmed@test.com');
      });
    });
  });

  describe('Given a Bearer token for a revoked session', () => {
    describe('When getSession is called', () => {
      it('Then returns null (unauthenticated)', async () => {
        const jwt = await signUpAndGetJwt(auth, 'revoked@test.com');

        // Verify the JWT works before revocation
        const before = await auth.api.getSession(new Headers({ Authorization: `Bearer ${jwt}` }));
        expect(before.ok).toBe(true);
        expect(before.data).not.toBeNull();

        // Revoke the session via cookie-based signOut
        await auth.api.signOut({
          headers: new Headers({ Cookie: `vertz.sid=${jwt}` }),
        });

        // Now the Bearer token should no longer work
        const after = await auth.api.getSession(new Headers({ Authorization: `Bearer ${jwt}` }));
        expect(after.ok).toBe(true);
        expect(after.data).toBeNull();
      });
    });
  });

  describe('Given an Authorization: Bearer header with an expired JWT', () => {
    describe('When getSession is called', () => {
      it('Then returns null (unauthenticated)', async () => {
        // Create auth with a very short TTL so the JWT expires quickly
        const shortAuth = createTestAuth({
          session: { strategy: 'jwt', ttl: '1s', refreshTtl: '7d' },
        });
        const jwt = await signUpAndGetJwt(shortAuth, 'expired@test.com');

        // Wait for JWT to expire
        await new Promise((resolve) => setTimeout(resolve, 1100));

        const result = await shortAuth.api.getSession(
          new Headers({ Authorization: `Bearer ${jwt}` }),
        );

        expect(result.ok).toBe(true);
        expect(result.data).toBeNull();
      });
    });
  });

  describe('Given a lowercase "bearer" scheme (RFC 7235 case-insensitive)', () => {
    describe('When getSession is called', () => {
      it('Then resolves the token correctly', async () => {
        const jwt = await signUpAndGetJwt(auth, 'lowercase@test.com');

        const result = await auth.api.getSession(new Headers({ Authorization: `bearer ${jwt}` }));

        expect(result.ok).toBe(true);
        expect(result.data).not.toBeNull();
        expect(result.data!.user.email).toBe('lowercase@test.com');
      });
    });
  });

  describe('Given an uppercase "BEARER" scheme', () => {
    describe('When getSession is called', () => {
      it('Then resolves the token correctly', async () => {
        const jwt = await signUpAndGetJwt(auth, 'uppercase@test.com');

        const result = await auth.api.getSession(new Headers({ Authorization: `BEARER ${jwt}` }));

        expect(result.ok).toBe(true);
        expect(result.data).not.toBeNull();
        expect(result.data!.user.email).toBe('uppercase@test.com');
      });
    });
  });

  describe('Given a Bearer-authenticated request to GET /api/auth/session', () => {
    describe('When the auth handler processes it', () => {
      it('Then returns the session data', async () => {
        const jwt = await signUpAndGetJwt(auth, 'http-bearer@test.com');

        const res = await auth.handler(
          new Request('http://localhost/api/auth/session', {
            headers: { Authorization: `Bearer ${jwt}` },
          }),
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.session).not.toBeNull();
        expect(body.session.user.email).toBe('http-bearer@test.com');
      });
    });
  });
});
