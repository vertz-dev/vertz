import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createAuth } from '@vertz/server';
import type { Server } from 'bun';
import type { AuthClient } from '../auth-client';
import { createAuthClient } from '../auth-client';

// ---------------------------------------------------------------------------
// Test server setup — minimal auth instance with tenant switching
// ---------------------------------------------------------------------------

let server: Server;
let baseURL: string;
let client: AuthClient;

const TEST_TENANT_ID = 'tenant-test';

const auth = createAuth({
  session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
  jwtSecret: 'auth-client-test-secret-at-least-32-chars!!',
  isProduction: false,
  tenant: {
    verifyMembership: async (_userId: string, tenantId: string) => {
      // Allow the test tenant, deny everything else
      return tenantId === TEST_TENANT_ID;
    },
  },
});

beforeAll(async () => {
  server = Bun.serve({
    port: 0, // random available port
    fetch: (req) => auth.handler(req),
  });
  baseURL = `http://localhost:${server.port}`;
  client = createAuthClient({ baseURL });
});

afterAll(() => {
  server?.stop(true);
  auth.dispose();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAuthClient', () => {
  it('returns an object with signup, signIn, and switchTenant methods', () => {
    const c = createAuthClient({ baseURL: 'http://localhost:3000' });

    expect(c.signup).toBeFunction();
    expect(c.signIn).toBeFunction();
    expect(c.switchTenant).toBeFunction();
  });

  describe('signup', () => {
    it('returns cookies in Playwright-compatible format', async () => {
      const result = await client.signup({
        email: `test-signup-${Date.now()}@test.local`,
        password: 'TestPassword123!',
      });

      expect(result.cookies.length).toBeGreaterThan(0);

      for (const cookie of result.cookies) {
        expect(cookie).toHaveProperty('name');
        expect(cookie).toHaveProperty('value');
        expect(cookie).toHaveProperty('domain');
        expect(cookie).toHaveProperty('path');
        expect(typeof cookie.name).toBe('string');
        expect(typeof cookie.value).toBe('string');
        expect(cookie.domain).toBe('localhost');
        expect(cookie.path).toBe('/');
      }
    });

    it('returns the session cookie (vertz.sid)', async () => {
      const result = await client.signup({
        email: `test-signup-sid-${Date.now()}@test.local`,
        password: 'TestPassword123!',
      });

      const sidCookie = result.cookies.find((c) => c.name === 'vertz.sid');
      expect(sidCookie).toBeDefined();
      expect(sidCookie?.value.length).toBeGreaterThan(0);
    });

    it('throws on invalid credentials', async () => {
      // Sign up same email twice → second should fail
      const email = `test-dup-${Date.now()}@test.local`;
      await client.signup({ email, password: 'TestPassword123!' });

      await expect(client.signup({ email, password: 'TestPassword123!' })).rejects.toThrow();
    });
  });

  describe('signIn', () => {
    it('returns cookies after signing in with valid credentials', async () => {
      const email = `test-signin-${Date.now()}@test.local`;
      const password = 'TestPassword123!';

      // Sign up first
      await client.signup({ email, password });

      // Then sign in
      const result = await client.signIn({ email, password });

      expect(result.cookies.length).toBeGreaterThan(0);

      const sidCookie = result.cookies.find((c) => c.name === 'vertz.sid');
      expect(sidCookie).toBeDefined();
      expect(sidCookie?.value.length).toBeGreaterThan(0);
    });

    it('throws on wrong password', async () => {
      const email = `test-signin-bad-${Date.now()}@test.local`;
      await client.signup({ email, password: 'TestPassword123!' });

      await expect(client.signIn({ email, password: 'WrongPassword!' })).rejects.toThrow();
    });
  });

  describe('switchTenant', () => {
    it('returns updated cookies with tenant context', async () => {
      const email = `test-tenant-${Date.now()}@test.local`;
      const { cookies } = await client.signup({ email, password: 'TestPassword123!' });

      const result = await client.switchTenant({ tenantId: TEST_TENANT_ID, cookies });

      expect(result.cookies.length).toBeGreaterThan(0);

      const sidCookie = result.cookies.find((c) => c.name === 'vertz.sid');
      expect(sidCookie).toBeDefined();
      expect(sidCookie?.value.length).toBeGreaterThan(0);
    });

    it('throws when user does not have tenant membership', async () => {
      const email = `test-tenant-bad-${Date.now()}@test.local`;
      const { cookies } = await client.signup({ email, password: 'TestPassword123!' });

      await expect(
        client.switchTenant({ tenantId: 'tenant-nonexistent', cookies }),
      ).rejects.toThrow();
    });
  });
});
