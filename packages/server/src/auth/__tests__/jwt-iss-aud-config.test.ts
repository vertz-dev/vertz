/**
 * Tests for JWT iss/aud claim integration through createAuth (#1723)
 */

import { describe, expect, it } from 'bun:test';
import { createPrivateKey } from 'node:crypto';
import * as jose from 'jose';
import { createAuth } from '../index';
import { createJWT } from '../jwt';
import type { AuthUser } from '../types';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

const testUser: AuthUser = {
  id: 'user-cross-iss',
  email: 'cross@example.com',
  role: 'user',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createTestAuth(overrides: Record<string, unknown> = {}) {
  return createAuth({
    session: { strategy: 'jwt' as const, ttl: '60s' },
    isProduction: false,
    privateKey: TEST_PRIVATE_KEY,
    publicKey: TEST_PUBLIC_KEY,
    ...overrides,
  });
}

describe('Feature: AuthConfig issuer/audience', () => {
  describe('Given production mode without issuer', () => {
    describe('When createAuth is called', () => {
      it('Then throws with helpful error message', () => {
        expect(() =>
          createAuth({
            session: { strategy: 'jwt', ttl: '60s' },
            isProduction: true,
            privateKey: TEST_PRIVATE_KEY,
            publicKey: TEST_PUBLIC_KEY,
            audience: 'myapp',
          }),
        ).toThrow(/issuer.*required.*production/i);
      });
    });
  });

  describe('Given production mode without audience', () => {
    describe('When createAuth is called', () => {
      it('Then throws with helpful error message', () => {
        expect(() =>
          createAuth({
            session: { strategy: 'jwt', ttl: '60s' },
            isProduction: true,
            privateKey: TEST_PRIVATE_KEY,
            publicKey: TEST_PUBLIC_KEY,
            issuer: 'https://myapp.example.com',
          }),
        ).toThrow(/audience.*required.*production/i);
      });
    });
  });

  describe('Given dev mode without issuer/audience', () => {
    describe('When createAuth is called', () => {
      it('Then defaults to vertz-dev for both', async () => {
        const auth = createTestAuth();

        const result = await auth.api.signUp({
          email: 'dev-defaults@example.com',
          password: 'Password123!',
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const decoded = jose.decodeJwt(result.data.tokens?.jwt);
        expect(decoded.iss).toBe('vertz-dev');
        expect(decoded.aud).toBe('vertz-dev');

        auth.dispose();
      });
    });
  });

  describe('Given issuer and audience are configured', () => {
    describe('When signUp creates a session', () => {
      it('Then the JWT contains iss and aud claims', async () => {
        const auth = createTestAuth({
          issuer: 'https://myapp.example.com',
          audience: 'myapp',
        });

        const result = await auth.api.signUp({
          email: 'iss-aud@example.com',
          password: 'Password123!',
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const decoded = jose.decodeJwt(result.data.tokens?.jwt);
        expect(decoded.iss).toBe('https://myapp.example.com');
        expect(decoded.aud).toBe('myapp');

        auth.dispose();
      });
    });

    describe('When getSession verifies the JWT', () => {
      it('Then validates iss and aud', async () => {
        const auth = createTestAuth({
          issuer: 'https://myapp.example.com',
          audience: 'myapp',
        });

        const signUpResult = await auth.api.signUp({
          email: 'get-session@example.com',
          password: 'Password123!',
        });
        expect(signUpResult.ok).toBe(true);
        if (!signUpResult.ok) return;

        const jwt = signUpResult.data.tokens?.jwt;
        const request = new Request('http://localhost/api/auth/session', {
          headers: { cookie: `vertz.sid=${jwt}` },
        });
        const response = await auth.handler(request);
        const body = await response.json();
        expect(body.session.user.email).toBe('get-session@example.com');

        auth.dispose();
      });
    });

    describe('When refreshSession issues a new JWT', () => {
      it('Then the new JWT contains iss and aud claims', async () => {
        const auth = createTestAuth({
          issuer: 'https://myapp.example.com',
          audience: 'myapp',
        });

        const signUpResult = await auth.api.signUp({
          email: 'refresh-iss-aud@example.com',
          password: 'Password123!',
        });
        expect(signUpResult.ok).toBe(true);
        if (!signUpResult.ok) return;

        const refreshToken = signUpResult.data.tokens?.refreshToken;
        const jwt = signUpResult.data.tokens?.jwt;

        const refreshResult = await auth.api.refreshSession({
          headers: new Headers({
            cookie: `vertz.sid=${jwt}; vertz.ref=${refreshToken}`,
          }),
        });

        expect(refreshResult.ok).toBe(true);
        if (!refreshResult.ok) return;

        const decoded = jose.decodeJwt(refreshResult.data.tokens?.jwt);
        expect(decoded.iss).toBe('https://myapp.example.com');
        expect(decoded.aud).toBe('myapp');

        auth.dispose();
      });
    });

    describe('When a JWT from a different issuer hits the handler', () => {
      it('Then getSession returns null (rejected)', async () => {
        const auth = createTestAuth({
          issuer: 'https://production.example.com',
          audience: 'myapp',
        });

        // Create a JWT with the right key but wrong issuer
        const wrongIssuerJwt = await createJWT(
          testUser,
          createPrivateKey(TEST_PRIVATE_KEY),
          60_000,
          {
            claims: () => ({ jti: 'jti-wrong', sid: 'sid-wrong' }),
            issuer: 'https://staging.example.com',
            audience: 'myapp',
          },
        );

        const request = new Request('http://localhost/api/auth/session', {
          headers: { cookie: `vertz.sid=${wrongIssuerJwt}` },
        });
        const response = await auth.handler(request);
        const body = await response.json();
        // Session should be null because issuer doesn't match
        expect(body.session).toBeNull();

        auth.dispose();
      });
    });

    describe('When resolveSessionForSSR verifies the JWT', () => {
      it('Then validates iss and aud', async () => {
        const auth = createTestAuth({
          issuer: 'https://myapp.example.com',
          audience: 'myapp',
        });

        const signUpResult = await auth.api.signUp({
          email: 'ssr-iss-aud@example.com',
          password: 'Password123!',
        });
        expect(signUpResult.ok).toBe(true);
        if (!signUpResult.ok) return;

        const jwt = signUpResult.data.tokens?.jwt;
        const request = new Request('http://localhost/', {
          headers: { cookie: `vertz.sid=${jwt}` },
        });

        const ssrResult = await auth.resolveSessionForSSR(request);
        expect(ssrResult).not.toBeNull();
        expect(ssrResult?.session.user.email).toBe('ssr-iss-aud@example.com');

        auth.dispose();
      });
    });
  });
});
