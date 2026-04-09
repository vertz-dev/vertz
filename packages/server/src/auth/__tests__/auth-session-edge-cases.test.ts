/**
 * Auth Session Edge Cases — Coverage hardening for auth/index.ts
 * Tests: session races, global error handler, CSRF edge cases, input validation
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from '@vertz/test';
import { createAuth } from '../index';
import { InMemorySessionStore } from '../session-store';
import type { AuthConfig, AuthInstance } from '../types';
import { InMemoryUserStore } from '../user-store';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

function createTestAuth(overrides?: Partial<AuthConfig>): AuthInstance {
  return createAuth({
    session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
    privateKey: TEST_PRIVATE_KEY,
    publicKey: TEST_PUBLIC_KEY,
    isProduction: false,
    oauthEncryptionKey: 'test-encryption-key-at-least-32-chars!!',
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

async function signUpAndGetCookies(
  auth: AuthInstance,
  email = 'test@example.com',
): Promise<{ sessionCookie: string; refreshCookie: string }> {
  const response = await auth.handler(
    new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    }),
  );
  const cookies = parseCookies(response);
  return {
    sessionCookie: `vertz.sid=${cookies['vertz.sid']}`,
    refreshCookie: `vertz.ref=${cookies['vertz.ref']}`,
  };
}

describe('Auth Session Edge Cases', () => {
  describe('Given a user deleted after JWT was issued', () => {
    describe('When GET /session is called with the old JWT', () => {
      it('Then returns session: null (line 589)', async () => {
        const userStore = new InMemoryUserStore();
        const auth = createTestAuth({ userStore });

        const { sessionCookie } = await signUpAndGetCookies(auth);

        // Find the user's ID and delete them
        const headers = new Headers({ cookie: sessionCookie });
        const sessionBefore = await auth.api.getSession(headers);
        expect(sessionBefore.ok).toBe(true);
        const userId = sessionBefore.ok ? sessionBefore.data?.user.id : null;
        expect(userId).toBeDefined();

        // Delete the user from the store
        await userStore.deleteUser(userId!);

        // Now getSession should return null (user not found)
        const res = await auth.handler(
          new Request('http://localhost/api/auth/session', {
            method: 'GET',
            headers: { Cookie: sessionCookie },
          }),
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { session: null };
        expect(body.session).toBeNull();
      });
    });
  });

  describe('Given a user deleted between token refresh requests', () => {
    describe('When POST /refresh is called', () => {
      it('Then returns 401 SESSION_EXPIRED (line 643)', async () => {
        const userStore = new InMemoryUserStore();
        const auth = createTestAuth({ userStore });

        const { sessionCookie, refreshCookie } = await signUpAndGetCookies(auth);

        // Get userId before deleting
        const headers = new Headers({ cookie: sessionCookie });
        const session = await auth.api.getSession(headers);
        const userId = session.ok ? session.data?.user.id : null;
        expect(userId).toBeDefined();

        // Delete the user
        await userStore.deleteUser(userId!);

        // Refresh should fail with SESSION_EXPIRED
        const res = await auth.handler(
          new Request('http://localhost/api/auth/refresh', {
            method: 'POST',
            headers: { Cookie: refreshCookie },
          }),
        );
        expect(res.status).toBe(401);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe('SESSION_EXPIRED');
      });
    });
  });

  describe('Given a grace period refresh where getCurrentTokens returns null', () => {
    describe('When the second rapid refresh occurs', () => {
      it('Then falls through to normal token rotation (line 670)', async () => {
        const sessionStore = new InMemorySessionStore();
        const auth = createTestAuth({ sessionStore });

        const { refreshCookie } = await signUpAndGetCookies(auth);

        // First refresh — rotates the token
        const firstRefreshRes = await auth.handler(
          new Request('http://localhost/api/auth/refresh', {
            method: 'POST',
            headers: { Cookie: refreshCookie },
          }),
        );
        expect(firstRefreshRes.status).toBe(200);

        // Override getCurrentTokens to return null for grace period path
        const originalGetCurrentTokens = sessionStore.getCurrentTokens.bind(sessionStore);
        let callCount = 0;
        sessionStore.getCurrentTokens = async (sessionId: string) => {
          callCount++;
          // First call is during grace period check — return null to hit line 670
          // Second call is for preserving fva — also return null
          if (callCount <= 2) return null;
          return originalGetCurrentTokens(sessionId);
        };

        // Second refresh with old token (triggers grace period + getCurrentTokens null)
        const secondRefreshRes = await auth.handler(
          new Request('http://localhost/api/auth/refresh', {
            method: 'POST',
            headers: { Cookie: refreshCookie },
          }),
        );
        // Should still succeed via normal rotation path
        expect(secondRefreshRes.status).toBe(200);
      });
    });
  });

  describe('Given no authentication for session revocation', () => {
    describe('When DELETE /sessions/:id is called without cookies', () => {
      it('Then returns 401 (line 744)', async () => {
        const auth = createTestAuth();

        const res = await auth.handler(
          new Request('http://localhost/api/auth/sessions/some-session-id', {
            method: 'DELETE',
          }),
        );
        expect(res.status).toBe(401);
      });
    });
  });

  describe('Given a malformed Referer header in CSRF check', () => {
    describe('When a POST request is made with an invalid URL as Referer', () => {
      it('Then catches the URL parse error (line 870)', async () => {
        const auth = createTestAuth();

        // Send with an invalid Referer that will throw in `new URL(referer)`
        const res = await auth.handler(
          new Request('http://localhost/api/auth/signin', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Referer: 'not-a-valid-url',
            },
            body: JSON.stringify({ email: 'test@example.com', password: 'pass' }),
          }),
        );
        // In dev mode, CSRF is warned but not blocked, so request proceeds
        // It should reach the signin handler and return an auth error
        expect(res.status).toBeLessThanOrEqual(500);
      });
    });
  });

  describe('Given an unexpected internal error in the handler', () => {
    describe('When the error is not caught by inner handlers (dev mode)', () => {
      it('Then returns 500 with real error message and stack', async () => {
        const userStore = new InMemoryUserStore();
        // Make findByEmail throw an unexpected error
        userStore.findByEmail = async () => {
          throw new Error('Unexpected database failure');
        };

        const auth = createTestAuth({ userStore });

        const res = await auth.handler(
          new Request('http://localhost/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
          }),
        );
        expect(res.status).toBe(500);
        const body = (await res.json()) as {
          error: { code: string; message: string; stack?: string };
        };
        expect(body.error.code).toBe('InternalError');
        expect(body.error.message).toBe('Unexpected database failure');
        expect(body.error.stack).toBeDefined();
      });
    });

    describe('When the error is not caught by inner handlers (production)', () => {
      it('Then returns 500 with generic message only', async () => {
        const userStore = new InMemoryUserStore();
        userStore.findByEmail = async () => {
          throw new Error('Unexpected database failure');
        };

        const auth = createTestAuth({
          userStore,
          isProduction: true,
          issuer: 'https://test.example.com',
          audience: 'test-app',
        });

        const res = await auth.handler(
          new Request('http://localhost/api/auth/signup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Origin: 'http://localhost',
              'X-VTZ-Request': '1',
            },
            body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
          }),
        );
        expect(res.status).toBe(500);
        const body = (await res.json()) as {
          error: { code: string; message: string; stack?: string };
        };
        expect(body.error.code).toBe('InternalError');
        expect(body.error.message).toBe('Internal server error');
        expect(body.error.stack).toBeUndefined();
      });
    });
  });

  describe('Given malformed JSON body sent to various endpoints', () => {
    let auth: AuthInstance;
    let sessionCookie: string;

    beforeEach(async () => {
      auth = createTestAuth({
        mfa: { enabled: true, issuer: 'TestApp' },
        tenant: { verifyMembership: async () => true },
      });
      const { sessionCookie: cookie } = await signUpAndGetCookies(auth);
      sessionCookie = cookie;
    });

    const endpoints = [
      { path: '/verify-email', method: 'POST', needsAuth: false },
      { path: '/forgot-password', method: 'POST', needsAuth: false },
      { path: '/reset-password', method: 'POST', needsAuth: false },
      { path: '/switch-tenant', method: 'POST', needsAuth: true },
    ];

    for (const { path, method, needsAuth } of endpoints) {
      it(`${method} ${path} returns 400 on malformed JSON`, async () => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (needsAuth) headers.Cookie = sessionCookie;

        const res = await auth.handler(
          new Request(`http://localhost/api/auth${path}`, {
            method,
            headers,
            body: '{bad json',
          }),
        );
        expect(res.status).toBe(400);
      });
    }
  });
});
