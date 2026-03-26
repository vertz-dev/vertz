import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createAuth } from '../index';
import type { AuthInstance } from '../types';
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

describe('Feature: Switch-tenant server resolution', () => {
  describe('Given multi-level tenant config with _resolveTenantLevel', () => {
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
          _resolveTenantLevel: async (tenantId: string) => {
            if (tenantId === 'acct-1') return 'account';
            if (tenantId === 'proj-1') return 'project';
            return null;
          },
          _tenantLevelNames: ['account', 'project'],
        },
      });
    });

    afterEach(() => {
      auth.dispose();
    });

    describe('When switching without tenantLevel', () => {
      it('Then server resolves tenantLevel from ID lookup', async () => {
        const signupRes = await signUp(auth);
        const cookies = getCookies(signupRes);

        const res = await auth.handler(
          makeRequest('POST', '/switch-tenant', { tenantId: 'proj-1' }, cookies),
        );
        expect(res.status).toBe(200);

        // Verify the response includes the resolved tenantId
        const data = await res.json();
        expect(data.tenantId).toBe('proj-1');
      });

      it('Then JWT contains resolved tenantLevel', async () => {
        const signupRes = await signUp(auth);
        const cookies = getCookies(signupRes);

        // Switch to proj-1 without specifying tenantLevel
        const switchRes = await auth.handler(
          makeRequest('POST', '/switch-tenant', { tenantId: 'proj-1' }, cookies),
        );
        const switchCookies = getCookies(switchRes);

        // Read session to verify tenantLevel is in the JWT payload
        const sessionRes = await auth.handler(
          makeRequest('GET', '/session', undefined, switchCookies),
        );
        const sessionData = await sessionRes.json();
        expect(sessionData.session.payload.tenantLevel).toBe('project');
      });
    });

    describe('When switching with valid tenantLevel', () => {
      it('Then accepts the provided level', async () => {
        const signupRes = await signUp(auth);
        const cookies = getCookies(signupRes);

        const res = await auth.handler(
          makeRequest(
            'POST',
            '/switch-tenant',
            { tenantId: 'acct-1', tenantLevel: 'account' },
            cookies,
          ),
        );
        expect(res.status).toBe(200);
      });
    });

    describe('When switching with invalid tenantLevel', () => {
      it('Then returns 400', async () => {
        const signupRes = await signUp(auth);
        const cookies = getCookies(signupRes);

        const res = await auth.handler(
          makeRequest(
            'POST',
            '/switch-tenant',
            { tenantId: 'acct-1', tenantLevel: 'nonexistent' },
            cookies,
          ),
        );
        expect(res.status).toBe(400);
      });
    });

    describe('When switching with ID not found in any tenant table', () => {
      it('Then returns 400', async () => {
        const signupRes = await signUp(auth);
        const cookies = getCookies(signupRes);

        // _resolveTenantLevel returns null for 'unknown-id'
        const res = await auth.handler(
          makeRequest('POST', '/switch-tenant', { tenantId: 'unknown-id' }, cookies),
        );
        // verifyMembership returns true, but level resolution fails → 400
        expect(res.status).toBe(400);
      });
    });
  });

  describe('Given no _resolveTenantLevel (single-level backward compat)', () => {
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

    describe('When switching without tenantLevel', () => {
      it('Then works without level resolution (backward compat)', async () => {
        const signupRes = await signUp(auth);
        const cookies = getCookies(signupRes);

        const res = await auth.handler(
          makeRequest('POST', '/switch-tenant', { tenantId: 'tenant-a' }, cookies),
        );
        expect(res.status).toBe(200);
      });
    });
  });
});
