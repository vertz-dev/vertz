/**
 * Integration Test: Auth Session Auto-Wiring into Entity Context
 *
 * Validates the full pipeline: auth sign-up → JWT → session middleware → entity handler
 * receives correct ctx.userId, ctx.tenantId, ctx.roles.
 *
 * Tests both cookie-based and Bearer token auth.
 * Issue: #1658
 */

import { describe, expect, it } from '@vertz/test';
import { generateKeyPairSync } from 'node:crypto';
import { d } from '@vertz/db';
import type { AuthConfig, AuthInstance, EntityDbAdapter } from '@vertz/server';
import {
  createAuth,
  createMiddleware,
  createServer,
  entity,
  InMemoryUserStore,
  rules,
} from '@vertz/server';

// ---------------------------------------------------------------------------
// Test RSA key pair
// ---------------------------------------------------------------------------

const { publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// ---------------------------------------------------------------------------
// Schema — tenant-scoped entity
// ---------------------------------------------------------------------------

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  tenantId: d.text(),
  title: d.text(),
  createdBy: d.text(),
});

const tasksModel = d.model(tasksTable);

// ---------------------------------------------------------------------------
// In-memory DB adapter
// ---------------------------------------------------------------------------

function createInMemoryDb(initial: Record<string, unknown>[] = []): EntityDbAdapter {
  const store = initial.map((r) => ({ ...r }));
  return {
    async get(id, _options?) {
      return store.find((r) => r.id === id) ?? null;
    },
    async list(options?: { where?: Record<string, unknown>; limit?: number; after?: string }) {
      let result = [...store];
      const where = options?.where;
      if (where) {
        result = result.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        );
      }
      const total = result.length;
      if (options?.after) {
        const afterIdx = result.findIndex((r) => r.id === options.after);
        result = afterIdx >= 0 ? result.slice(afterIdx + 1) : [];
      }
      if (options?.limit !== undefined) {
        result = result.slice(0, options.limit);
      }
      return { data: result, total };
    },
    async create(data) {
      const record = { id: `id-${store.length + 1}`, ...data };
      store.push(record);
      return record;
    },
    async update(id, data, _options?) {
      const existing = store.find((r) => r.id === id);
      if (!existing) return { id, ...data };
      Object.assign(existing, data);
      return { ...existing };
    },
    async delete(id, _options?) {
      const idx = store.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      return store.splice(idx, 1)[0] ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function createTestAuth(overrides?: Partial<AuthConfig>): AuthInstance {
  return createAuth({
    session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
    privateKey: TEST_PRIVATE_KEY as string,
    publicKey: TEST_PUBLIC_KEY as string,
    isProduction: false,
    // Enable tenant switching — all users are allowed into any tenant
    tenant: {
      verifyMembership: async () => true,
    },
    ...overrides,
  });
}

function parseCookies(response: Response): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const header of response.headers.getSetCookie()) {
    const [nameValue] = header.split(';');
    const [name, ...rest] = nameValue.split('=');
    cookies[name.trim()] = rest.join('=');
  }
  return cookies;
}

/**
 * Creates a middleware that bridges auth session data into entity context.
 * This replicates what createServer() does internally when auth is configured.
 */
function createSessionBridge(authApi: AuthInstance['api']) {
  return createMiddleware({
    name: 'test-auth-session',
    handler: async (ctx: Record<string, unknown>) => {
      const raw = ctx.raw as { headers?: Headers } | undefined;
      if (!raw?.headers) return {};

      const result = await authApi.getSession(raw.headers);
      if (!result.ok || !result.data) return {};

      return {
        userId: result.data.user.id,
        tenantId: result.data.payload.tenantId ?? null,
        roles: [result.data.user.role],
        user: result.data.user,
        session: result.data,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: Auth session auto-wiring into entity context', () => {
  describe('Given a server with auth and a tenant-scoped entity', () => {
    const tasksEntity = entity('tasks', {
      model: tasksModel,
      access: {
        list: rules.authenticated(),
        get: rules.authenticated(),
        create: rules.authenticated(),
        update: rules.authenticated(),
        delete: rules.authenticated(),
      },
    });

    function createApp(seedData: Record<string, unknown>[] = []) {
      const auth = createTestAuth();
      const db = createInMemoryDb(seedData);
      const app = createServer({ entities: [tasksEntity], db }).middlewares([
        createSessionBridge(auth.api),
      ]);
      return { app, auth };
    }

    async function signUpAndGetJwt(auth: AuthInstance, email: string): Promise<string> {
      const res = await auth.handler(
        new Request('http://localhost/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: 'password123' }),
        }),
      );
      return parseCookies(res)['vertz.sid'];
    }

    // --- Cookie-based auth ---

    describe('When an authenticated request hits the entity API (cookie)', () => {
      it('Then the entity handler receives correct ctx.userId from session', async () => {
        const { app, auth } = createApp();
        const jwt = await signUpAndGetJwt(auth, 'cookie@test.com');

        // Create a task — should succeed because user is authenticated
        const createRes = await app.handler(
          new Request('http://localhost/api/tasks', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: `vertz.sid=${jwt}`,
            },
            body: JSON.stringify({ title: 'My Task', createdBy: 'cookie-user' }),
          }),
        );

        expect(createRes.status).toBe(201);
        const task = await createRes.json();
        expect(task.title).toBe('My Task');
      });

      it('Then tenant-scoped queries filter by ctx.tenantId', async () => {
        const seedData = [
          { id: 't1', tenantId: 'tenant-a', title: 'Task A', createdBy: 'u1' },
          { id: 't2', tenantId: 'tenant-b', title: 'Task B', createdBy: 'u2' },
        ];

        const userStore = new InMemoryUserStore();
        const auth = createTestAuth({ userStore });
        const db = createInMemoryDb(seedData);
        const app = createServer({ entities: [tasksEntity], db }).middlewares([
          createSessionBridge(auth.api),
        ]);

        // Sign up → get JWT (no tenantId in JWT by default)
        const jwt = await signUpAndGetJwt(auth, 'filter@test.com');

        // Switch tenant to 'tenant-a'
        const switchRes = await auth.handler(
          new Request('http://localhost/api/auth/switch-tenant', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: `vertz.sid=${jwt}`,
            },
            body: JSON.stringify({ tenantId: 'tenant-a' }),
          }),
        );

        const newJwt = parseCookies(switchRes)['vertz.sid'];

        // List tasks — should only see tenant-a tasks
        const listRes = await app.handler(
          new Request('http://localhost/api/tasks', {
            headers: { Cookie: `vertz.sid=${newJwt}` },
          }),
        );

        expect(listRes.status).toBe(200);
        const body = await listRes.json();
        expect(body.items).toHaveLength(1);
        expect(body.items[0].title).toBe('Task A');
      });
    });

    // --- Bearer token auth ---

    describe('When an authenticated request hits the entity API (Bearer token)', () => {
      it('Then the entity handler receives correct ctx.userId from Bearer JWT', async () => {
        const { app, auth } = createApp();
        const jwt = await signUpAndGetJwt(auth, 'bearer@test.com');

        const createRes = await app.handler(
          new Request('http://localhost/api/tasks', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({ title: 'Bearer Task', createdBy: 'bearer-user' }),
          }),
        );

        expect(createRes.status).toBe(201);
        const task = await createRes.json();
        expect(task.title).toBe('Bearer Task');
      });

      it('Then tenant-scoped queries filter by ctx.tenantId (Bearer)', async () => {
        const seedData = [
          { id: 't1', tenantId: 'tenant-x', title: 'Task X', createdBy: 'u1' },
          { id: 't2', tenantId: 'tenant-y', title: 'Task Y', createdBy: 'u2' },
        ];

        const auth = createTestAuth();
        const db = createInMemoryDb(seedData);
        const app = createServer({ entities: [tasksEntity], db }).middlewares([
          createSessionBridge(auth.api),
        ]);

        const jwt = await signUpAndGetJwt(auth, 'bearer-tenant@test.com');

        // Switch tenant
        const switchRes = await auth.handler(
          new Request('http://localhost/api/auth/switch-tenant', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: `vertz.sid=${jwt}`,
            },
            body: JSON.stringify({ tenantId: 'tenant-x' }),
          }),
        );

        const tenantJwt = parseCookies(switchRes)['vertz.sid'];

        // List tasks with Bearer token — should only see tenant-x tasks
        const listRes = await app.handler(
          new Request('http://localhost/api/tasks', {
            headers: { Authorization: `Bearer ${tenantJwt}` },
          }),
        );

        expect(listRes.status).toBe(200);
        const body = await listRes.json();
        expect(body.items).toHaveLength(1);
        expect(body.items[0].title).toBe('Task X');
      });
    });

    // --- Unauthenticated ---

    describe('When an unauthenticated request hits a protected entity API', () => {
      it('Then the request is rejected (403)', async () => {
        const { app } = createApp();

        const res = await app.handler(new Request('http://localhost/api/tasks'));

        expect(res.status).toBe(403);
      });
    });

    // --- Auth route with Bearer ---

    describe('When a Bearer-authenticated request hits GET /api/auth/session', () => {
      it('Then returns the session data', async () => {
        const auth = createTestAuth();
        const jwt = await signUpAndGetJwt(auth, 'session-check@test.com');

        const res = await auth.handler(
          new Request('http://localhost/api/auth/session', {
            headers: { Authorization: `Bearer ${jwt}` },
          }),
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.session).not.toBeNull();
        expect(body.session.user.email).toBe('session-check@test.com');
      });
    });
  });
});
