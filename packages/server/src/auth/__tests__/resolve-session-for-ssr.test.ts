/**
 * Tests for resolveSessionForSSR — JWT-only session resolution for SSR injection.
 */

import { describe, expect, it } from 'bun:test';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { createJWT } from '../jwt';
import { resolveSessionForSSR } from '../resolve-session-for-ssr';
import type { AuthUser } from '../types';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

const COOKIE_NAME = 'vertz.sid';

const testUser: AuthUser = {
  id: 'user-123',
  email: 'test@example.com',
  role: 'admin',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createRequest(cookieHeader?: string): Request {
  const headers = new Headers();
  if (cookieHeader) {
    headers.set('cookie', cookieHeader);
  }
  return new Request('http://localhost/', { headers });
}

async function createValidJWT(
  customClaims?: (user: AuthUser) => Record<string, unknown>,
): Promise<string> {
  return createJWT(testUser, createPrivateKey(TEST_PRIVATE_KEY), 60_000, {
    claims: (user) => ({
      jti: 'jti-test',
      sid: 'sid-test',
      ...customClaims?.(user),
    }),
  });
}

function createResolver() {
  return resolveSessionForSSR({
    publicKey: createPublicKey(TEST_PUBLIC_KEY),
    cookieName: COOKIE_NAME,
  });
}

describe('resolveSessionForSSR', () => {
  describe('Given a request with a valid session JWT cookie', () => {
    describe('When resolveSessionForSSR is called', () => {
      it('Then returns { session: { user, expiresAt } }', async () => {
        const jwt = await createValidJWT();
        const request = createRequest(`${COOKIE_NAME}=${jwt}`);
        const resolver = createResolver();

        const result = await resolver(request);

        expect(result).not.toBeNull();
        expect(result!.session).toBeDefined();
        expect(result!.session.user).toBeDefined();
        expect(result!.session.expiresAt).toBeGreaterThan(Date.now());
      });

      it('Then user contains only id, email, role from JWT payload (allowlist)', async () => {
        const jwt = await createValidJWT(() => ({
          jti: 'jti-test',
          sid: 'sid-test',
          customField: 'should-not-appear',
        }));
        const request = createRequest(`${COOKIE_NAME}=${jwt}`);
        const resolver = createResolver();

        const result = await resolver(request);

        expect(result!.session.user.id).toBe('user-123');
        expect(result!.session.user.email).toBe('test@example.com');
        expect(result!.session.user.role).toBe('admin');
        // Custom claims must NOT leak into user
        expect(result!.session.user).not.toHaveProperty('customField');
        expect(result!.session.user).not.toHaveProperty('jti');
        expect(result!.session.user).not.toHaveProperty('sid');
      });

      it('Then expiresAt is the JWT exp claim in milliseconds (exp * 1000)', async () => {
        const jwt = await createValidJWT();
        const request = createRequest(`${COOKIE_NAME}=${jwt}`);
        const resolver = createResolver();

        const result = await resolver(request);

        // JWT exp is in seconds. expiresAt should be in milliseconds.
        // Should be roughly now + 60s (within a 5s tolerance)
        const expectedMs = Date.now() + 60_000;
        expect(result!.session.expiresAt).toBeGreaterThan(expectedMs - 5_000);
        expect(result!.session.expiresAt).toBeLessThan(expectedMs + 5_000);
      });

      it('Then includes tenantId when present in JWT', async () => {
        const jwt = await createValidJWT(() => ({
          jti: 'jti-test',
          sid: 'sid-test',
          tenantId: 'tenant-abc',
        }));
        const request = createRequest(`${COOKIE_NAME}=${jwt}`);
        const resolver = createResolver();

        const result = await resolver(request);

        expect(result!.session.user.tenantId).toBe('tenant-abc');
      });
    });
  });

  describe('Given a request with an expired JWT cookie', () => {
    describe('When resolveSessionForSSR is called', () => {
      it('Then returns null', async () => {
        // Create JWT with 1ms TTL and wait for expiration
        const jwt = await createJWT(testUser, createPrivateKey(TEST_PRIVATE_KEY), 1, {
          claims: () => ({
            jti: 'jti-expired',
            sid: 'sid-expired',
          }),
        });
        await new Promise((resolve) => setTimeout(resolve, 1100));

        const request = createRequest(`${COOKIE_NAME}=${jwt}`);
        const resolver = createResolver();

        const result = await resolver(request);
        expect(result).toBeNull();
      });
    });
  });

  describe('Given a request with no cookie', () => {
    describe('When resolveSessionForSSR is called', () => {
      it('Then returns null', async () => {
        const request = createRequest();
        const resolver = createResolver();

        const result = await resolver(request);
        expect(result).toBeNull();
      });
    });
  });

  describe('Given a request with a malformed cookie value', () => {
    describe('When resolveSessionForSSR is called', () => {
      it('Then returns null (does not throw)', async () => {
        const request = createRequest(`${COOKIE_NAME}=not-a-valid-jwt`);
        const resolver = createResolver();

        const result = await resolver(request);
        expect(result).toBeNull();
      });
    });
  });

  describe('Given a request with a valid JWT that has no acl claim', () => {
    describe('When resolveSessionForSSR is called', () => {
      it('Then returns { session, accessSet: undefined }', async () => {
        const jwt = await createValidJWT();
        const request = createRequest(`${COOKIE_NAME}=${jwt}`);
        const resolver = createResolver();

        const result = await resolver(request);

        expect(result).not.toBeNull();
        expect(result!.accessSet).toBeUndefined();
      });
    });
  });

  describe('Given a request with a valid JWT that has an acl claim (no overflow)', () => {
    describe('When resolveSessionForSSR is called', () => {
      it('Then returns { session, accessSet } with decoded access set', async () => {
        const jwt = await createValidJWT(() => ({
          jti: 'jti-test',
          sid: 'sid-test',
          acl: {
            set: {
              entitlements: {
                'task:read': { allowed: true },
                'task:write': { allowed: false, reason: 'no_permission' },
              },
              flags: { beta: true },
              plan: 'pro',
              computedAt: '2025-01-01T00:00:00Z',
            },
            hash: 'abc123',
            overflow: false,
          },
        }));
        const request = createRequest(`${COOKIE_NAME}=${jwt}`);
        const resolver = createResolver();

        const result = await resolver(request);

        expect(result).not.toBeNull();
        expect(result!.accessSet).toBeDefined();
        expect(result!.accessSet!.entitlements['task:read'].allowed).toBe(true);
        expect(result!.accessSet!.flags.beta).toBe(true);
        expect(result!.accessSet!.plan).toBe('pro');
      });
    });
  });

  describe('Given a request with a valid JWT that has an overflow acl claim', () => {
    describe('When resolveSessionForSSR is called', () => {
      it('Then returns { session, accessSet: null }', async () => {
        const jwt = await createValidJWT(() => ({
          jti: 'jti-test',
          sid: 'sid-test',
          acl: {
            hash: 'abc123',
            overflow: true,
          },
        }));
        const request = createRequest(`${COOKIE_NAME}=${jwt}`);
        const resolver = createResolver();

        const result = await resolver(request);

        expect(result).not.toBeNull();
        expect(result!.accessSet).toBeNull();
      });
    });
  });

  describe('Given a cookie header with multiple cookies', () => {
    it('extracts the correct cookie even when values contain = characters', async () => {
      const jwt = await createValidJWT();
      // JWT tokens are base64url (no padding `=`), but test that the parser
      // handles a cookie header where other cookies have `=` in their values
      const request = createRequest(`other=abc=def; ${COOKIE_NAME}=${jwt}; trailing=x=y=z`);
      const resolver = createResolver();

      const result = await resolver(request);
      expect(result).not.toBeNull();
      expect(result!.session.user.id).toBe('user-123');
    });
  });

  describe('Given a custom cookie name', () => {
    it('reads from the correct cookie', async () => {
      const jwt = await createValidJWT();
      const request = createRequest(`custom.sid=${jwt}`);
      const resolver = resolveSessionForSSR({
        publicKey: createPublicKey(TEST_PUBLIC_KEY),
        cookieName: 'custom.sid',
      });

      const result = await resolver(request);
      expect(result).not.toBeNull();
      expect(result!.session.user.id).toBe('user-123');
    });
  });
});
