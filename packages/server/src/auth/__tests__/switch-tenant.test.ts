import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createAuth } from '../index';
import type { AuthInstance, SwitchTenantInput } from '../types';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  cookies = '',
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: 'http://localhost',
    'X-VTZ-Request': '1',
  };
  if (cookies) {
    headers.Cookie = cookies;
  }
  return new Request(`http://localhost/api/auth${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function signUp(auth: AuthInstance, email = 'user@example.com', password = 'Password123!') {
  return auth.handler(makeRequest('POST', '/signup', { email, password }));
}

function getCookies(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: Tenant switching (POST /auth/switch-tenant)', () => {
  describe('Given tenant config is NOT configured', () => {
    let auth: AuthInstance;

    beforeEach(() => {
      auth = createAuth({
        session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
        emailPassword: { enabled: true },
        privateKey: TEST_PRIVATE_KEY,
        publicKey: TEST_PUBLIC_KEY,
        isProduction: false,
      });
    });

    afterEach(() => {
      auth.dispose();
    });

    describe('When POST /auth/switch-tenant is called', () => {
      it('Then returns 404', async () => {
        const signupRes = await signUp(auth);
        const cookies = getCookies(signupRes);

        const res = await auth.handler(
          makeRequest('POST', '/switch-tenant', { tenantId: 'tenant-a' }, cookies),
        );
        expect(res.status).toBe(404);
      });
    });
  });

  describe('Given tenant config IS configured and user has membership', () => {
    let auth: AuthInstance;

    beforeEach(() => {
      auth = createAuth({
        session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
        emailPassword: { enabled: true },
        privateKey: TEST_PRIVATE_KEY,
        publicKey: TEST_PUBLIC_KEY,
        isProduction: false,
        tenant: {
          verifyMembership: async (_userId: string, tenantId: string) => {
            return tenantId === 'tenant-a' || tenantId === 'tenant-b';
          },
        },
      });
    });

    afterEach(() => {
      auth.dispose();
    });

    describe('When POST /auth/switch-tenant is called with a valid tenantId', () => {
      it('Then returns 200 with new session cookies containing tenantId', async () => {
        const signupRes = await signUp(auth);
        const cookies = getCookies(signupRes);

        const res = await auth.handler(
          makeRequest('POST', '/switch-tenant', { tenantId: 'tenant-a' }, cookies),
        );
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.tenantId).toBe('tenant-a');

        // Should have new session cookies
        const setCookies = res.headers.getSetCookie();
        const hasSid = setCookies.some((c) => c.startsWith('vertz.sid='));
        const hasRef = setCookies.some((c) => c.startsWith('vertz.ref='));
        expect(hasSid).toBe(true);
        expect(hasRef).toBe(true);
      });
    });

    describe('When POST /auth/switch-tenant is called with an unauthorized tenantId', () => {
      it('Then returns 403', async () => {
        const signupRes = await signUp(auth);
        const cookies = getCookies(signupRes);

        const res = await auth.handler(
          makeRequest('POST', '/switch-tenant', { tenantId: 'tenant-forbidden' }, cookies),
        );
        expect(res.status).toBe(403);

        const data = await res.json();
        expect(data.error.code).toBe('AUTH_FORBIDDEN');
      });
    });
  });

  describe('Given tenant config IS configured but user is not authenticated', () => {
    let auth: AuthInstance;

    beforeEach(() => {
      auth = createAuth({
        session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
        emailPassword: { enabled: true },
        privateKey: TEST_PRIVATE_KEY,
        publicKey: TEST_PUBLIC_KEY,
        isProduction: false,
        tenant: {
          verifyMembership: async () => true,
        },
      });
    });

    afterEach(() => {
      auth.dispose();
    });

    describe('When POST /auth/switch-tenant is called without a session', () => {
      it('Then returns 401', async () => {
        const res = await auth.handler(
          makeRequest('POST', '/switch-tenant', { tenantId: 'tenant-a' }),
        );
        expect(res.status).toBe(401);
      });
    });
  });

  describe('Given user switches tenant and then reads session', () => {
    let auth: AuthInstance;

    beforeEach(() => {
      auth = createAuth({
        session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
        emailPassword: { enabled: true },
        privateKey: TEST_PRIVATE_KEY,
        publicKey: TEST_PUBLIC_KEY,
        isProduction: false,
        tenant: {
          verifyMembership: async (_userId: string, tenantId: string) => {
            return tenantId === 'tenant-a' || tenantId === 'tenant-b';
          },
        },
      });
    });

    afterEach(() => {
      auth.dispose();
    });

    describe('When session is read after switching tenant', () => {
      it('Then the session payload contains the tenantId', async () => {
        const signupRes = await signUp(auth);
        const cookies = getCookies(signupRes);

        // Switch to tenant-a
        const switchRes = await auth.handler(
          makeRequest('POST', '/switch-tenant', { tenantId: 'tenant-a' }, cookies),
        );
        expect(switchRes.status).toBe(200);

        // Use new cookies from switch-tenant response
        const newCookies = getCookies(switchRes);

        // Read session with new cookies
        const sessionRes = await auth.handler(
          makeRequest('GET', '/session', undefined, newCookies),
        );
        expect(sessionRes.status).toBe(200);

        const data = await sessionRes.json();
        expect(data.session).toBeDefined();
        expect(data.session.payload.tenantId).toBe('tenant-a');
      });
    });

    describe('When user switches tenant again', () => {
      it('Then the new session payload reflects the latest tenantId', async () => {
        const signupRes = await signUp(auth);
        const cookies = getCookies(signupRes);

        // Switch to tenant-a
        const switchRes1 = await auth.handler(
          makeRequest('POST', '/switch-tenant', { tenantId: 'tenant-a' }, cookies),
        );
        const cookies1 = getCookies(switchRes1);

        // Switch to tenant-b
        const switchRes2 = await auth.handler(
          makeRequest('POST', '/switch-tenant', { tenantId: 'tenant-b' }, cookies1),
        );
        expect(switchRes2.status).toBe(200);

        const data = await switchRes2.json();
        expect(data.tenantId).toBe('tenant-b');
      });
    });
  });
});
