import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import * as jose from 'jose';
import { createServer } from '../create-server';

let privateKey: CryptoKey;
let publicJwk: jose.JWK;
let kid: string;
let mockCloudServer: ReturnType<typeof Bun.serve>;
let cloudBaseUrl: string;
const originalEnv = process.env.VERTZ_CLOUD_TOKEN;

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

      // Signup endpoint
      if (url.pathname.endsWith('/signup')) {
        const jwt = await new jose.SignJWT({
          sub: 'user_cs',
          email: 'cs@example.com',
          role: 'user',
          jti: 'jwt_cs',
          sid: 'sess_cs',
        })
          .setProtectedHeader({ alg: 'RS256', kid })
          .setIssuedAt()
          .setExpirationTime('1h')
          .setIssuer(url.origin)
          .setAudience('proj_cstest')
          .sign(privateKey);

        return new Response(
          JSON.stringify({
            user: { id: 'user_cs', email: 'cs@example.com' },
            _tokens: { jwt, refreshToken: 'ref_cs' },
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

afterEach(() => {
  if (originalEnv !== undefined) {
    process.env.VERTZ_CLOUD_TOKEN = originalEnv;
  } else {
    delete process.env.VERTZ_CLOUD_TOKEN;
  }
});

describe('createServer — cloud mode branching', () => {
  describe('Given cloud.projectId is set and VERTZ_CLOUD_TOKEN is available', () => {
    it('then returns a ServerInstance without requiring jwtSecret or auth config', () => {
      process.env.VERTZ_CLOUD_TOKEN = 'vtk_ci_token';

      const server = createServer({
        cloud: { projectId: 'proj_cstest', cloudBaseUrl },
      });

      expect(server).toBeDefined();
      expect(server.auth).toBeDefined();
      expect(typeof server.auth.handler).toBe('function');
      expect(typeof server.auth.resolveSessionForSSR).toBe('function');
      expect(typeof server.requestHandler).toBe('function');
    });

    it('then routes /api/auth/* requests to the cloud proxy', async () => {
      process.env.VERTZ_CLOUD_TOKEN = 'vtk_ci_token';

      const server = createServer({
        cloud: { projectId: 'proj_cstest', cloudBaseUrl },
      });

      const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'pass123' }),
      });

      const res = await server.requestHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.user.id).toBe('user_cs');
      expect(body._tokens).toBeUndefined(); // Tokens stripped by proxy
    });

    it('then sets JWT in vertz.sid cookie via the proxy', async () => {
      process.env.VERTZ_CLOUD_TOKEN = 'vtk_ci_token';

      const server = createServer({
        cloud: { projectId: 'proj_cstest', cloudBaseUrl },
      });

      const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await server.requestHandler(req);
      const cookies = res.headers.getSetCookie();
      const sidCookie = cookies.find((c) => c.startsWith('vertz.sid='));
      expect(sidCookie).toBeTruthy();
    });

    it('then resolveSessionForSSR verifies JWT via cloud JWKS', async () => {
      process.env.VERTZ_CLOUD_TOKEN = 'vtk_ci_token';

      const server = createServer({
        cloud: { projectId: 'proj_cstest', cloudBaseUrl },
      });

      // Sign a JWT as if the cloud issued it
      const jwt = await new jose.SignJWT({
        sub: 'user_ssr',
        email: 'ssr@example.com',
        role: 'admin',
        jti: 'jwt_ssr',
        sid: 'sess_ssr',
      })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setIssuedAt()
        .setExpirationTime('1h')
        .setIssuer(cloudBaseUrl)
        .setAudience('proj_cstest')
        .sign(privateKey);

      const req = new Request('http://localhost/page', {
        headers: { Cookie: `vertz.sid=${jwt}` },
      });

      const result = await server.auth.resolveSessionForSSR(req);
      expect(result).not.toBeNull();
      expect(result!.session.user.id).toBe('user_ssr');
      expect(result!.session.user.email).toBe('ssr@example.com');
      expect(result!.session.user.role).toBe('admin');
      expect(result!.session.expiresAt).toBeGreaterThan(Date.now());
    });

    it('then resolveSessionForSSR returns null for missing cookie', async () => {
      process.env.VERTZ_CLOUD_TOKEN = 'vtk_ci_token';

      const server = createServer({
        cloud: { projectId: 'proj_cstest', cloudBaseUrl },
      });

      const req = new Request('http://localhost/page');
      const result = await server.auth.resolveSessionForSSR(req);
      expect(result).toBeNull();
    });

    it('then does NOT require clientId/clientSecret on providers', () => {
      process.env.VERTZ_CLOUD_TOKEN = 'vtk_ci_token';

      // Cloud mode — no providers needed, no jwtSecret needed
      const server = createServer({
        cloud: { projectId: 'proj_cstest', cloudBaseUrl },
      });

      expect(server.auth).toBeDefined();
    });

    it('then logs which auth source was resolved', () => {
      process.env.VERTZ_CLOUD_TOKEN = 'vtk_ci_token';
      const infoSpy = spyOn(console, 'info');

      createServer({
        cloud: { projectId: 'proj_cstest', cloudBaseUrl },
      });

      const logCall = infoSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('Cloud auth resolved'),
      );
      expect(logCall).toBeTruthy();
      expect(logCall![0]).toContain('ci-token');
      expect(logCall![0]).toContain('proj_cstest');

      infoSpy.mockRestore();
    });
  });

  describe('Given both cloud.projectId and auth config are set', () => {
    it('then logs a warning that cloud mode takes precedence', () => {
      process.env.VERTZ_CLOUD_TOKEN = 'vtk_ci_token';
      const warnSpy = spyOn(console, 'warn');
      const infoSpy = spyOn(console, 'info');

      createServer({
        cloud: { projectId: 'proj_cstest', cloudBaseUrl },
        auth: {
          session: { strategy: 'jwt', ttl: '1h' },
          jwtSecret: 'should-be-ignored',
        },
      });

      const warnCall = warnSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('Cloud mode takes precedence'),
      );
      expect(warnCall).toBeTruthy();

      warnSpy.mockRestore();
      infoSpy.mockRestore();
    });
  });

  describe('Given cloud.projectId is set but no auth context exists', () => {
    it('then createServer throws a prescriptive error', () => {
      delete process.env.VERTZ_CLOUD_TOKEN;

      expect(() =>
        createServer({
          cloud: { projectId: 'proj_cstest', cloudBaseUrl },
          // No VERTZ_CLOUD_TOKEN, no auth.json — sessionPath points nowhere
        }),
      ).toThrow(/Cloud auth requires authentication/);
    });
  });

  describe('Given cloud.projectId with invalid format', () => {
    it('then createServer throws a project ID validation error', () => {
      process.env.VERTZ_CLOUD_TOKEN = 'vtk_ci_token';

      expect(() =>
        createServer({
          cloud: { projectId: 'invalid_no_prefix', cloudBaseUrl },
        }),
      ).toThrow(/proj_/);
    });
  });

  describe('Given non-auth routes', () => {
    it('then requestHandler routes non-auth requests to entity handler', async () => {
      process.env.VERTZ_CLOUD_TOKEN = 'vtk_ci_token';

      const server = createServer({
        cloud: { projectId: 'proj_cstest', cloudBaseUrl },
      });

      const req = new Request('http://localhost/api/tasks', { method: 'GET' });
      const res = await server.requestHandler(req);

      // No entity routes configured, so core handler returns 404
      expect(res.status).toBe(404);
    });
  });
});
