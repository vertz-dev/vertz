import { describe, expect, it } from 'bun:test';
import type { CloudJWTVerifier } from './cloud-jwt-verifier';
import { resolveSessionForSSR } from './resolve-session-for-ssr';
import type { SessionPayload } from './types';

// --- Helpers ---

function makeRequest(cookie?: string): Request {
  const headers = new Headers();
  if (cookie) {
    headers.set('cookie', cookie);
  }
  return new Request('http://localhost/', { headers });
}

function makeMockVerifier(payload: SessionPayload | null): CloudJWTVerifier {
  return {
    async verify(_token: string) {
      return payload;
    },
  };
}

const validPayload: SessionPayload = {
  sub: 'user_1',
  email: 'test@example.com',
  role: 'member',
  jti: 'jti_1',
  sid: 'sid_1',
  iat: Math.floor(Date.now() / 1000) - 60,
  exp: Math.floor(Date.now() / 1000) + 3600,
};

// --- Tests ---

describe('resolveSessionForSSR with cloudVerifier', () => {
  describe('Given resolveSessionForSSR with cloudVerifier', () => {
    describe('When a valid RS256 JWT is in the cookie', () => {
      it('then returns session data using cloud verifier', async () => {
        const verifier = makeMockVerifier(validPayload);
        const resolve = resolveSessionForSSR({
          cloudVerifier: verifier,
          cookieName: 'vertz.sid',
        });

        const result = await resolve(makeRequest('vertz.sid=some.rs256.token'));

        expect(result).not.toBeNull();
        expect(result!.session.user.id).toBe('user_1');
        expect(result!.session.user.email).toBe('test@example.com');
        expect(result!.session.user.role).toBe('member');
        expect(result!.session.expiresAt).toBe(validPayload.exp * 1000);
      });
    });

    describe('When the cloud verifier returns null (expired/invalid)', () => {
      it('then returns null', async () => {
        const verifier = makeMockVerifier(null);
        const resolve = resolveSessionForSSR({
          cloudVerifier: verifier,
          cookieName: 'vertz.sid',
        });

        const result = await resolve(makeRequest('vertz.sid=expired.token'));
        expect(result).toBeNull();
      });
    });

    describe('When no cookie is present', () => {
      it('then returns null without calling verifier', async () => {
        let verifyCalled = false;
        const verifier: CloudJWTVerifier = {
          async verify() {
            verifyCalled = true;
            return validPayload;
          },
        };
        const resolve = resolveSessionForSSR({
          cloudVerifier: verifier,
          cookieName: 'vertz.sid',
        });

        const result = await resolve(makeRequest());
        expect(result).toBeNull();
        expect(verifyCalled).toBe(false);
      });
    });

    describe('When payload includes tenantId', () => {
      it('then includes tenantId in session user', async () => {
        const payloadWithTenant: SessionPayload = { ...validPayload, tenantId: 'tenant_1' };
        const verifier = makeMockVerifier(payloadWithTenant);
        const resolve = resolveSessionForSSR({
          cloudVerifier: verifier,
          cookieName: 'vertz.sid',
        });

        const result = await resolve(makeRequest('vertz.sid=some.token'));
        expect(result!.session.user.tenantId).toBe('tenant_1');
      });
    });
  });
});

describe('resolveSessionForSSR with jwtSecret (backward compat)', () => {
  describe('Given resolveSessionForSSR with jwtSecret', () => {
    it('then verifies using symmetric HS256', async () => {
      // Use the existing verifyJWT path
      const resolve = resolveSessionForSSR({
        jwtSecret: 'test-secret-at-least-32-chars-long!',
        jwtAlgorithm: 'HS256',
        cookieName: 'vertz.sid',
      });

      // Without a real HS256 token, this should return null (verification fails)
      const result = await resolve(makeRequest('vertz.sid=invalid.hs256.token'));
      expect(result).toBeNull();
    });
  });
});

describe('resolveSessionForSSR config validation', () => {
  describe('Given neither jwtSecret nor cloudVerifier', () => {
    it('then throws configuration error at construction time', () => {
      expect(() => {
        resolveSessionForSSR({
          cookieName: 'vertz.sid',
        } as any);
      }).toThrow();
    });
  });
});
