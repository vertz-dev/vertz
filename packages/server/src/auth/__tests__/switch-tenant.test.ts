import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { createAuth } from '../index';
import type { AuthInstance, TenantInfo } from '../types';
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

  describe('Given switchTenant updates lastTenantId', () => {
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
          listTenants: async (_userId: string): Promise<TenantInfo[]> => {
            return [
              { id: 'tenant-a', name: 'Tenant A' },
              { id: 'tenant-b', name: 'Tenant B' },
            ];
          },
        },
      });
    });

    afterEach(() => {
      auth.dispose();
    });

    it('Then GET /tenants returns updated lastTenantId after switch', async () => {
      const signupRes = await signUp(auth);
      const cookies = getCookies(signupRes);

      // Switch to tenant-a
      const switchRes = await auth.handler(
        makeRequest('POST', '/switch-tenant', { tenantId: 'tenant-a' }, cookies),
      );
      expect(switchRes.status).toBe(200);
      const switchCookies = getCookies(switchRes);

      // GET /tenants should reflect lastTenantId
      const tenantsRes = await auth.handler(
        makeRequest('GET', '/tenants', undefined, switchCookies),
      );
      expect(tenantsRes.status).toBe(200);
      const data = await tenantsRes.json();
      expect(data.lastTenantId).toBe('tenant-a');

      // Switch to tenant-b
      const switchRes2 = await auth.handler(
        makeRequest('POST', '/switch-tenant', { tenantId: 'tenant-b' }, switchCookies),
      );
      const switchCookies2 = getCookies(switchRes2);

      // GET /tenants should now reflect tenant-b
      const tenantsRes2 = await auth.handler(
        makeRequest('GET', '/tenants', undefined, switchCookies2),
      );
      const data2 = await tenantsRes2.json();
      expect(data2.lastTenantId).toBe('tenant-b');
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/tenants
// ---------------------------------------------------------------------------

describe('Feature: List tenants (GET /auth/tenants)', () => {
  describe('Given listTenants is configured', () => {
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
          listTenants: async (_userId: string): Promise<TenantInfo[]> => {
            return [
              { id: 'org-1', name: 'Acme Corp', avatarUrl: 'https://example.com/acme.png' },
              { id: 'org-2', name: 'Side Project' },
            ];
          },
        },
      });
    });

    afterEach(() => {
      auth.dispose();
    });

    describe('When GET /tenants is called with valid session', () => {
      it('Then returns tenants, currentTenantId, lastTenantId, resolvedDefaultId', async () => {
        const signupRes = await signUp(auth);
        const cookies = getCookies(signupRes);

        const res = await auth.handler(makeRequest('GET', '/tenants', undefined, cookies));
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.tenants).toHaveLength(2);
        expect(data.tenants[0].id).toBe('org-1');
        expect(data.tenants[0].name).toBe('Acme Corp');
        expect(data.tenants[0].avatarUrl).toBe('https://example.com/acme.png');
        expect(data.tenants[1].id).toBe('org-2');
        expect(data.currentTenantId).toBeUndefined();
        expect(data.lastTenantId).toBeUndefined();
        // Default resolve: no lastTenantId, so first tenant
        expect(data.resolvedDefaultId).toBe('org-1');
      });
    });

    describe('When GET /tenants is called without session', () => {
      it('Then returns 401', async () => {
        const res = await auth.handler(makeRequest('GET', '/tenants'));
        expect(res.status).toBe(401);
      });
    });
  });

  describe('Given listTenants is NOT configured', () => {
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

    describe('When GET /tenants is called', () => {
      it('Then returns 404', async () => {
        const signupRes = await signUp(auth);
        const cookies = getCookies(signupRes);

        const res = await auth.handler(makeRequest('GET', '/tenants', undefined, cookies));
        expect(res.status).toBe(404);
      });
    });
  });

  describe('Given resolveDefault is provided', () => {
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
          listTenants: async (): Promise<TenantInfo[]> => {
            return [
              { id: 'org-1', name: 'First' },
              { id: 'org-2', name: 'Second' },
            ];
          },
          resolveDefault: async (_userId, _tenants) => {
            return 'org-2'; // Always resolve to second tenant
          },
        },
      });
    });

    afterEach(() => {
      auth.dispose();
    });

    it('Then resolvedDefaultId comes from resolveDefault callback', async () => {
      const signupRes = await signUp(auth);
      const cookies = getCookies(signupRes);

      const res = await auth.handler(makeRequest('GET', '/tenants', undefined, cookies));
      const data = await res.json();
      expect(data.resolvedDefaultId).toBe('org-2');
    });
  });

  describe('Given user has 0 tenants', () => {
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
          listTenants: async (): Promise<TenantInfo[]> => [],
        },
      });
    });

    afterEach(() => {
      auth.dispose();
    });

    it('Then returns empty tenants and undefined resolvedDefaultId', async () => {
      const signupRes = await signUp(auth);
      const cookies = getCookies(signupRes);

      const res = await auth.handler(makeRequest('GET', '/tenants', undefined, cookies));
      const data = await res.json();
      expect(data.tenants).toHaveLength(0);
      expect(data.resolvedDefaultId).toBeUndefined();
    });
  });
});
