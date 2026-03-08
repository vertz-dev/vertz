/**
 * Token Refresh Tests — Sub-Phase 3
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
    jwtSecret: 'token-refresh-test-secret-at-least-32-chars',
    isProduction: false,
    ...overrides,
  });
}

describe('Token Refresh', () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createTestAuth();
  });

  it('refresh with valid token rotates both tokens', async () => {
    const signUpResult = await auth.api.signUp({
      email: 'rotate@test.com',
      password: 'password123',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    const refreshResult = await auth.api.refreshSession({
      headers: new Headers({
        cookie: `vertz.ref=${signUpResult.data.tokens?.refreshToken}`,
      }),
      request: new Request('http://localhost/api/auth/refresh'),
    });
    expect(refreshResult.ok).toBe(true);
    if (!refreshResult.ok) return;

    // Tokens should be different
    expect(refreshResult.data.tokens?.jwt).not.toBe(signUpResult.data.tokens?.jwt);
    expect(refreshResult.data.tokens?.refreshToken).not.toBe(
      signUpResult.data.tokens?.refreshToken,
    );
  });

  it('old token within 10s grace period returns current (idempotent) tokens', async () => {
    const signUpResult = await auth.api.signUp({
      email: 'grace@test.com',
      password: 'password123',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    // First refresh — rotates tokens
    const refresh1 = await auth.api.refreshSession({
      headers: new Headers({
        cookie: `vertz.ref=${signUpResult.data.tokens?.refreshToken}`,
      }),
      request: new Request('http://localhost/api/auth/refresh'),
    });
    expect(refresh1.ok).toBe(true);
    if (!refresh1.ok) return;

    // Second refresh with OLD token — grace period
    const refresh2 = await auth.api.refreshSession({
      headers: new Headers({
        cookie: `vertz.ref=${signUpResult.data.tokens?.refreshToken}`,
      }),
      request: new Request('http://localhost/api/auth/refresh'),
    });
    expect(refresh2.ok).toBe(true);
    if (!refresh2.ok) return;

    // Should return the same tokens (idempotent)
    expect(refresh2.data.tokens?.jwt).toBe(refresh1.data.tokens?.jwt);
    expect(refresh2.data.tokens?.refreshToken).toBe(refresh1.data.tokens?.refreshToken);
  });

  it('revoked session returns 401 and clears both cookies', async () => {
    const signUpResult = await auth.api.signUp({
      email: 'revoked@test.com',
      password: 'password123',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    // Revoke session
    const headers = new Headers({
      cookie: `vertz.sid=${signUpResult.data.tokens?.jwt}`,
    });
    await auth.api.revokeSession(signUpResult.data.payload.sid, headers);

    // Try to refresh
    const res = await auth.handler(
      new Request('http://localhost/api/auth/refresh', {
        method: 'POST',
        headers: {
          cookie: `vertz.ref=${signUpResult.data.tokens?.refreshToken}`,
        },
      }),
    );
    expect(res.status).toBe(401);

    // Should clear both cookies
    const setCookies = res.headers.getSetCookie();
    const sidClear = setCookies.find((c) => c.startsWith('vertz.sid='));
    const refClear = setCookies.find((c) => c.startsWith('vertz.ref='));
    expect(sidClear).toContain('Max-Age=0');
    expect(refClear).toContain('Max-Age=0');
  });

  it('missing vertz.ref cookie returns 401', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/refresh', {
        method: 'POST',
        headers: {},
      }),
    );
    expect(res.status).toBe(401);
  });

  it('expired session returns 401 on refresh', async () => {
    // Create auth with very short refresh TTL
    const shortAuth = createTestAuth({
      session: { strategy: 'jwt', ttl: '60s', refreshTtl: '1s' },
    });

    const signUpResult = await shortAuth.api.signUp({
      email: 'expired-refresh@test.com',
      password: 'password123',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    // Wait for refresh token to expire
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const refreshResult = await shortAuth.api.refreshSession({
      headers: new Headers({
        cookie: `vertz.ref=${signUpResult.data.tokens?.refreshToken}`,
      }),
      request: new Request('http://localhost/api/auth/refresh'),
    });
    expect(refreshResult.ok).toBe(false);
  });

  it('refresh loads fresh user data', async () => {
    const signUpResult = await auth.api.signUp({
      email: 'freshdata@test.com',
      password: 'password123',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    // Refresh should return user data
    const refreshResult = await auth.api.refreshSession({
      headers: new Headers({
        cookie: `vertz.ref=${signUpResult.data.tokens?.refreshToken}`,
      }),
      request: new Request('http://localhost/api/auth/refresh'),
    });
    expect(refreshResult.ok).toBe(true);
    if (!refreshResult.ok) return;

    // User data should be present and match original
    expect(refreshResult.data.user.email).toBe('freshdata@test.com');
    expect(refreshResult.data.user.id).toBe(signUpResult.data.user.id);
  });
});

describe('Sign Out', () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createTestAuth();
  });

  it('sign-out clears vertz.sid cookie with Path=/', async () => {
    const signUpResult = await auth.api.signUp({
      email: 'signout@test.com',
      password: 'password123',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    const res = await auth.handler(
      new Request('http://localhost/api/auth/signout', {
        method: 'POST',
        headers: { cookie: `vertz.sid=${signUpResult.data.tokens?.jwt}` },
      }),
    );
    expect(res.status).toBe(200);

    const setCookies = res.headers.getSetCookie();
    const sidClear = setCookies.find((c) => c.startsWith('vertz.sid='));
    expect(sidClear).toContain('Max-Age=0');
    expect(sidClear).toContain('Path=/');
  });

  it('sign-out clears vertz.ref cookie with Path=/api/auth/refresh', async () => {
    const signUpResult = await auth.api.signUp({
      email: 'signoutref@test.com',
      password: 'password123',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    const res = await auth.handler(
      new Request('http://localhost/api/auth/signout', {
        method: 'POST',
        headers: { cookie: `vertz.sid=${signUpResult.data.tokens?.jwt}` },
      }),
    );

    const setCookies = res.headers.getSetCookie();
    const refClear = setCookies.find((c) => c.startsWith('vertz.ref='));
    expect(refClear).toContain('Max-Age=0');
    expect(refClear).toContain('Path=/api/auth/refresh');
  });

  it('sign-out includes Cache-Control: no-store', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/signout', {
        method: 'POST',
        headers: {},
      }),
    );
    expect(res.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
  });
});
