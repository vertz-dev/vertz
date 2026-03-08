/**
 * Integration Test: Dual-Token Sessions
 * Uses @vertz/server public imports only — validates the dual-token lifecycle end-to-end.
 *
 * RED state: These tests exercise the dual-token API.
 * They will pass once all sub-phases are implemented.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createAuth } from '@vertz/server';
import type { AuthConfig, AuthInstance, SessionInfo } from '@vertz/server';

function createTestAuth(overrides?: Partial<AuthConfig>): AuthInstance {
  return createAuth({
    session: {
      strategy: 'jwt',
      ttl: '60s',
      refreshTtl: '7d',
    },
    jwtSecret: 'integration-test-secret-at-least-32-chars',
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

function getCookieAttribute(response: Response, cookieName: string, attr: string): string | null {
  for (const header of response.headers.getSetCookie()) {
    if (header.startsWith(`${cookieName}=`)) {
      const parts = header.split(';').map((p) => p.trim());
      for (const part of parts) {
        if (part.toLowerCase().startsWith(attr.toLowerCase())) {
          const [, val] = part.split('=');
          return val ?? '';
        }
      }
    }
  }
  return null;
}

describe('Dual-Token Sessions (Integration)', () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createTestAuth();
  });

  describe('Full lifecycle', () => {
    it('signUp → 60s JWT + 7d refresh → refresh rotates → revokeSession → refresh fails', async () => {
      // 1. Sign up
      const signUpRes = await auth.handler(
        new Request('http://localhost/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'lifecycle@test.com', password: 'password123' }),
        }),
      );
      expect(signUpRes.status).toBe(201);

      const signUpCookies = parseCookies(signUpRes);
      expect(signUpCookies['vertz.sid']).toBeDefined();
      expect(signUpCookies['vertz.ref']).toBeDefined();

      // Verify JWT has short expiry
      const sidMaxAge = getCookieAttribute(signUpRes, 'vertz.sid', 'Max-Age');
      expect(sidMaxAge).toBe('60');

      // Verify refresh has 7d expiry
      const refMaxAge = getCookieAttribute(signUpRes, 'vertz.ref', 'Max-Age');
      expect(refMaxAge).toBe('604800');

      // 2. Refresh — rotates tokens
      const refreshRes = await auth.handler(
        new Request('http://localhost/api/auth/refresh', {
          method: 'POST',
          headers: {
            cookie: `vertz.ref=${signUpCookies['vertz.ref']}`,
          },
        }),
      );
      expect(refreshRes.status).toBe(200);

      const refreshCookies = parseCookies(refreshRes);
      expect(refreshCookies['vertz.sid']).toBeDefined();
      expect(refreshCookies['vertz.ref']).toBeDefined();
      // Tokens should be rotated (different from original)
      expect(refreshCookies['vertz.ref']).not.toBe(signUpCookies['vertz.ref']);

      // 3. Get session with new JWT
      const sessionRes = await auth.handler(
        new Request('http://localhost/api/auth/session', {
          method: 'GET',
          headers: {
            cookie: `vertz.sid=${refreshCookies['vertz.sid']}`,
          },
        }),
      );
      expect(sessionRes.status).toBe(200);
      const sessionBody = (await sessionRes.json()) as { session: { user: { email: string } } };
      expect(sessionBody.session?.user?.email).toBe('lifecycle@test.com');

      // 4. List sessions — get session ID
      const listRes = await auth.handler(
        new Request('http://localhost/api/auth/sessions', {
          method: 'GET',
          headers: {
            cookie: `vertz.sid=${refreshCookies['vertz.sid']}`,
          },
        }),
      );
      expect(listRes.status).toBe(200);
      const listBody = (await listRes.json()) as { sessions: SessionInfo[] };
      expect(listBody.sessions.length).toBeGreaterThanOrEqual(1);

      const currentSession = listBody.sessions.find((s) => s.isCurrent);
      expect(currentSession).toBeDefined();

      // 5. Revoke the session
      await auth.handler(
        new Request(`http://localhost/api/auth/sessions/${currentSession!.id}`, {
          method: 'DELETE',
          headers: {
            cookie: `vertz.sid=${refreshCookies['vertz.sid']}`,
          },
        }),
      );

      // 6. Refresh with old token should fail
      const failedRefresh = await auth.handler(
        new Request('http://localhost/api/auth/refresh', {
          method: 'POST',
          headers: {
            cookie: `vertz.ref=${refreshCookies['vertz.ref']}`,
          },
        }),
      );
      expect(failedRefresh.status).toBe(401);
    });
  });

  describe('Grace period', () => {
    it('rotated token within 10s returns same tokens (idempotent)', async () => {
      // Sign up to get initial tokens
      const signUpRes = await auth.handler(
        new Request('http://localhost/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'grace@test.com', password: 'password123' }),
        }),
      );
      const initialCookies = parseCookies(signUpRes);

      // First refresh — rotates tokens
      const refresh1 = await auth.handler(
        new Request('http://localhost/api/auth/refresh', {
          method: 'POST',
          headers: { cookie: `vertz.ref=${initialCookies['vertz.ref']}` },
        }),
      );
      expect(refresh1.status).toBe(200);
      const refresh1Cookies = parseCookies(refresh1);

      // Second refresh with OLD token (within grace period) — should return same current tokens
      const refresh2 = await auth.handler(
        new Request('http://localhost/api/auth/refresh', {
          method: 'POST',
          headers: { cookie: `vertz.ref=${initialCookies['vertz.ref']}` },
        }),
      );
      expect(refresh2.status).toBe(200);
      const refresh2Cookies = parseCookies(refresh2);

      // Grace period should return the same tokens as the first refresh
      expect(refresh2Cookies['vertz.sid']).toBe(refresh1Cookies['vertz.sid']);
      expect(refresh2Cookies['vertz.ref']).toBe(refresh1Cookies['vertz.ref']);
    });
  });

  describe('Session management', () => {
    it('list, revoke single, revoke all', async () => {
      // Create two sessions
      const signup1 = await auth.handler(
        new Request('http://localhost/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'mgmt@test.com', password: 'password123' }),
        }),
      );
      const cookies1 = parseCookies(signup1);

      const signin2 = await auth.handler(
        new Request('http://localhost/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'mgmt@test.com', password: 'password123' }),
        }),
      );
      const cookies2 = parseCookies(signin2);

      // List sessions — should have 2
      const listRes = await auth.handler(
        new Request('http://localhost/api/auth/sessions', {
          method: 'GET',
          headers: { cookie: `vertz.sid=${cookies2['vertz.sid']}` },
        }),
      );
      const listBody = (await listRes.json()) as { sessions: SessionInfo[] };
      expect(listBody.sessions.length).toBe(2);

      // Revoke all except current
      await auth.handler(
        new Request('http://localhost/api/auth/sessions', {
          method: 'DELETE',
          headers: { cookie: `vertz.sid=${cookies2['vertz.sid']}` },
        }),
      );

      // List again — should have 1
      const listRes2 = await auth.handler(
        new Request('http://localhost/api/auth/sessions', {
          method: 'GET',
          headers: { cookie: `vertz.sid=${cookies2['vertz.sid']}` },
        }),
      );
      const listBody2 = (await listRes2.json()) as { sessions: SessionInfo[] };
      expect(listBody2.sessions.length).toBe(1);
      expect(listBody2.sessions[0].isCurrent).toBe(true);
    });
  });

  describe('getSession with expired JWT', () => {
    it('returns null for expired JWT', async () => {
      // Create auth with very short JWT TTL
      const shortAuth = createTestAuth({
        session: { strategy: 'jwt', ttl: '1s' },
      });

      const signUpRes = await shortAuth.handler(
        new Request('http://localhost/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'expired@test.com', password: 'password123' }),
        }),
      );
      const cookies = parseCookies(signUpRes);

      // Wait for JWT to expire
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const sessionRes = await shortAuth.handler(
        new Request('http://localhost/api/auth/session', {
          method: 'GET',
          headers: { cookie: `vertz.sid=${cookies['vertz.sid']}` },
        }),
      );
      expect(sessionRes.status).toBe(200);
      const body = (await sessionRes.json()) as { session: null };
      expect(body.session).toBeNull();
    });
  });

  describe('Sign-out clears both cookies', () => {
    it('clears both cookies with correct paths', async () => {
      const signUpRes = await auth.handler(
        new Request('http://localhost/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'signout@test.com', password: 'password123' }),
        }),
      );
      const cookies = parseCookies(signUpRes);

      const signOutRes = await auth.handler(
        new Request('http://localhost/api/auth/signout', {
          method: 'POST',
          headers: { cookie: `vertz.sid=${cookies['vertz.sid']}` },
        }),
      );
      expect(signOutRes.status).toBe(200);

      // Should have two Set-Cookie headers clearing both cookies
      const setCookies = signOutRes.headers.getSetCookie();
      expect(setCookies.length).toBe(2);

      const sidClear = setCookies.find((c) => c.startsWith('vertz.sid='));
      const refClear = setCookies.find((c) => c.startsWith('vertz.ref='));
      expect(sidClear).toContain('Max-Age=0');
      expect(refClear).toContain('Max-Age=0');
      expect(refClear).toContain('Path=/api/auth/refresh');
    });
  });
});
