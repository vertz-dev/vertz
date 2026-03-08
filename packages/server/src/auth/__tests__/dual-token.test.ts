/**
 * Dual-Token Issuance Tests — Sub-Phase 2
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { createAuth } from '../index';
import type { AuthConfig, AuthInstance } from '../types';

function createTestAuth(overrides?: Partial<AuthConfig>): AuthInstance {
  return createAuth({
    session: {
      strategy: 'jwt',
      ttl: '60s',
      refreshTtl: '7d',
    },
    jwtSecret: 'dual-token-test-secret-at-least-32-chars',
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

describe('Dual-Token Issuance', () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createTestAuth();
  });

  it('sign-up returns both vertz.sid and vertz.ref cookies', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dual@test.com', password: 'password123' }),
      }),
    );
    expect(res.status).toBe(201);

    const cookies = parseCookies(res);
    expect(cookies['vertz.sid']).toBeDefined();
    expect(cookies['vertz.ref']).toBeDefined();
  });

  it('sign-in returns both vertz.sid and vertz.ref cookies', async () => {
    // Sign up first
    await auth.api.signUp({ email: 'signin@test.com', password: 'password123' });

    const res = await auth.handler(
      new Request('http://localhost/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'signin@test.com', password: 'password123' }),
      }),
    );
    expect(res.status).toBe(200);

    const cookies = parseCookies(res);
    expect(cookies['vertz.sid']).toBeDefined();
    expect(cookies['vertz.ref']).toBeDefined();
  });

  it('JWT contains sid and jti claims', async () => {
    const result = await auth.api.signUp({ email: 'claims@test.com', password: 'password123' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.payload.sid).toBeDefined();
      expect(result.data.payload.jti).toBeDefined();
    }
  });

  it('session cookie has Max-Age=60', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'maxage@test.com', password: 'password123' }),
      }),
    );

    const maxAge = getCookieAttribute(res, 'vertz.sid', 'Max-Age');
    expect(maxAge).toBe('60');
  });

  it('refresh cookie has Path=/api/auth/refresh', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'refpath@test.com', password: 'password123' }),
      }),
    );

    const path = getCookieAttribute(res, 'vertz.ref', 'Path');
    expect(path).toBe('/api/auth/refresh');
  });

  it('refresh cookie has Max-Age=604800 (7 days)', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'refmaxage@test.com', password: 'password123' }),
      }),
    );

    const maxAge = getCookieAttribute(res, 'vertz.ref', 'Max-Age');
    expect(maxAge).toBe('604800');
  });

  it('auth responses include Cache-Control: no-store', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'cache@test.com', password: 'password123' }),
      }),
    );

    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('getSession returns session from valid JWT without session Map lookup', async () => {
    const result = await auth.api.signUp({
      email: 'getsession@test.com',
      password: 'password123',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Use the JWT from sign-up to get session
    const headers = new Headers();
    headers.set('cookie', `vertz.sid=${result.data.tokens?.jwt}`);

    const sessionResult = await auth.api.getSession(headers);
    expect(sessionResult.ok).toBe(true);
    if (sessionResult.ok) {
      expect(sessionResult.data?.user.email).toBe('getsession@test.com');
    }
  });

  it('cookies include HttpOnly flag', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'httponly@test.com', password: 'password123' }),
      }),
    );

    const setCookies = res.headers.getSetCookie();
    const sidCookie = setCookies.find((c) => c.startsWith('vertz.sid='));
    const refCookie = setCookies.find((c) => c.startsWith('vertz.ref='));
    expect(sidCookie).toContain('HttpOnly');
    expect(refCookie).toContain('HttpOnly');
  });

  it('dispose cleans up stores', () => {
    const disposableAuth = createTestAuth();
    // Should not throw
    disposableAuth.dispose();
  });

  it('getSession returns null for expired JWT', async () => {
    const shortAuth = createTestAuth({
      session: { strategy: 'jwt', ttl: '1s' },
    });

    const result = await shortAuth.api.signUp({
      email: 'expired@test.com',
      password: 'password123',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Wait for JWT to expire
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const headers = new Headers();
    headers.set('cookie', `vertz.sid=${result.data.tokens?.jwt}`);

    const sessionResult = await shortAuth.api.getSession(headers);
    expect(sessionResult.ok).toBe(true);
    if (sessionResult.ok) {
      expect(sessionResult.data).toBeNull();
    }
  });
});
