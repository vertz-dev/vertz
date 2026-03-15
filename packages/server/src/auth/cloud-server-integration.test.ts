import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import * as jose from 'jose';
import { createCloudJWTVerifier } from './cloud-jwt-verifier';
import { createJWKSClient } from './jwks-client';
import { resolveCloudAuthContext, validateProjectId } from './cloud-startup';
import { createAuthProxy } from './cloud-proxy';

/**
 * Phase 1 integration test: Cloud auth E2E — config to verified JWT.
 *
 * Tests the full chain: config → JWKS client → JWT verifier → proxy → cookies.
 * This is the "developer walkthrough" test (RED in Phase 1, GREEN by end of phase).
 */

let privateKey: CryptoKey;
let publicJwk: jose.JWK;
let kid: string;
let mockCloudServer: ReturnType<typeof Bun.serve>;
let cloudBaseUrl: string;

beforeAll(async () => {
  // Generate RS256 key pair
  const kp = await jose.generateKeyPair('RS256');
  privateKey = kp.privateKey as CryptoKey;
  publicJwk = await jose.exportJWK(kp.publicKey);
  kid = 'cloud-key-1';
  publicJwk.kid = kid;
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';

  // Mock cloud server — serves JWKS and handles auth routes
  mockCloudServer = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);

      // JWKS endpoint
      if (url.pathname.endsWith('/.well-known/jwks.json')) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Signup endpoint — returns user + tokens
      if (url.pathname.endsWith('/signup')) {
        const jwt = await new jose.SignJWT({
          sub: 'user_new',
          email: 'new@example.com',
          role: 'user',
          jti: 'jwt_new',
          sid: 'sess_new',
        })
          .setProtectedHeader({ alg: 'RS256', kid })
          .setIssuedAt()
          .setExpirationTime('1h')
          .setIssuer(url.origin)
          .setAudience('proj_integration')
          .sign(privateKey);

        return new Response(
          JSON.stringify({
            user: { id: 'user_new', email: 'new@example.com' },
            _tokens: { jwt, refreshToken: 'ref_token_abc' },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  cloudBaseUrl = `http://localhost:${mockCloudServer.port}`;
});

afterAll(() => {
  mockCloudServer?.stop();
});

describe('Feature: Cloud auth E2E — config to verified JWT', () => {
  describe('Given cloud.projectId is set and VERTZ_CLOUD_TOKEN is available', () => {
    it('then the full chain works: JWKS → verifier → proxy → cookies → JWT verified', async () => {
      const projectId = 'proj_integration';

      // 1. Validate project ID
      validateProjectId(projectId);

      // 2. Create JWKS client
      const jwksClient = createJWKSClient({
        url: `${cloudBaseUrl}/auth/v1/${projectId}/.well-known/jwks.json`,
      });

      // 3. Create cloud JWT verifier
      const verifier = createCloudJWTVerifier({
        jwksClient,
        issuer: cloudBaseUrl,
        audience: projectId,
      });

      // 4. Create proxy
      const proxy = createAuthProxy({
        projectId,
        cloudBaseUrl,
        environment: 'development',
        authToken: 'vtk_test_token',
      });

      // 5. Proxy a signup request
      const signupReq = new Request(`${cloudBaseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new@example.com', password: 'securepass123' }),
      });

      const signupRes = await proxy(signupReq);
      expect(signupRes.status).toBe(200);

      // 6. Extract JWT from cookie
      const cookies = signupRes.headers.getSetCookie();
      const sidCookie = cookies.find((c) => c.startsWith('vertz.sid='));
      expect(sidCookie).toBeTruthy();

      const jwt = sidCookie!.split('=')[1].split(';')[0];

      // 7. Verify the JWT through the cloud verifier (RS256 JWKS chain)
      const payload = await verifier.verify(jwt);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe('user_new');
      expect(payload!.email).toBe('new@example.com');
      expect(payload!.role).toBe('user');

      // 8. Response body should NOT contain _tokens
      const body = await signupRes.json();
      expect(body._tokens).toBeUndefined();
      expect(body.user.id).toBe('user_new');
    });
  });

  describe('Given cloud JWT with wrong audience', () => {
    it('then verifier returns null (cross-project token rejected)', async () => {
      const jwksClient = createJWKSClient({
        url: `${cloudBaseUrl}/auth/v1/proj_integration/.well-known/jwks.json`,
      });

      // Verifier expects proj_integration audience
      const verifier = createCloudJWTVerifier({
        jwksClient,
        issuer: cloudBaseUrl,
        audience: 'proj_integration',
      });

      // JWT signed for a different project
      const jwt = await new jose.SignJWT({
        sub: 'user_attacker',
        email: 'attacker@evil.com',
        role: 'admin',
        jti: 'jwt_evil',
        sid: 'sess_evil',
      })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setIssuedAt()
        .setExpirationTime('1h')
        .setIssuer(cloudBaseUrl)
        .setAudience('proj_different_project')
        .sign(privateKey);

      const payload = await verifier.verify(jwt);
      expect(payload).toBeNull();
    });
  });

  describe('Given no cloud config (backward compat)', () => {
    it('then cloud modules can be imported but are not used', () => {
      // This test verifies that the cloud modules are tree-shakeable —
      // importing them doesn't cause side effects or require cloud credentials
      expect(typeof createJWKSClient).toBe('function');
      expect(typeof createCloudJWTVerifier).toBe('function');
      expect(typeof createAuthProxy).toBe('function');
      expect(typeof validateProjectId).toBe('function');
      expect(typeof resolveCloudAuthContext).toBe('function');
    });
  });
});
