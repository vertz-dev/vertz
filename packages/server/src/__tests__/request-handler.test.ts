import { describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from '../auth/__tests__/test-keys';
import type { AuthConfig } from '../auth/types';
import { createServer } from '../create-server';

// ---------------------------------------------------------------------------
// Helpers — minimal mocks for ServerInstance (db + auth required)
// ---------------------------------------------------------------------------

const ok = <T>(data: T) => ({ ok: true as const, data });

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
});
const usersModel = d.model(usersTable);

// Auth requires these tables in the DatabaseClient
const authTableNames = [
  'auth_users',
  'auth_sessions',
  'auth_oauth_accounts',
  'auth_role_assignments',
  'auth_closure',
  'auth_plans',
  'auth_plan_addons',
  'auth_flags',
  'auth_overrides',
] as const;

const authTables = Object.fromEntries(
  authTableNames.map((name) => [name, d.table(name, { id: d.uuid().primary() })]),
);

function createMockDelegate() {
  return {
    get: async () => ok(null),
    getOrThrow: async () => ok(null),
    list: async () => ok([]),
    listAndCount: async () => ok({ data: [], total: 0 }),
    create: async (data: unknown) => ok(data),
    update: async () => ok(null),
    delete: async () => ok(null),
  };
}

function createMockDatabaseClient() {
  const delegates = Object.fromEntries(
    [...authTableNames, 'users'].map((name) => [name, createMockDelegate()]),
  );

  const models = Object.fromEntries([
    ['users', { table: usersTable }],
    ...authTableNames.map((name) => [name, { table: authTables[name] }]),
  ]);

  return {
    ...delegates,
    close: async () => {},
    isHealthy: async () => true,
    query: async () => ok({ rows: [], rowCount: 0 }),
    _internals: {
      models,
      dialect: { paramPlaceholder: () => '?', quoteName: (n: string) => `"${n}"` },
      tenantGraph: {
        root: null,
        levels: [],
        directlyScoped: [],
        indirectlyScoped: [],
        shared: [],
      },
    },
  };
}

const authConfig: AuthConfig = {
  session: { strategy: 'jwt', ttl: '7d' },
  privateKey: TEST_PRIVATE_KEY,
  publicKey: TEST_PUBLIC_KEY,
  emailPassword: { enabled: true },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: Unified request handler (requestHandler)', () => {
  describe('Given a ServerInstance with auth and entities', () => {
    function createTestServer() {
      const db = createMockDatabaseClient();
      return createServer({
        basePath: '/',
        db,
        auth: authConfig,
        entities: [
          {
            kind: 'entity',
            name: 'users',
            model: usersModel,
            inject: {},
            access: {
              list: () => true,
              get: () => true,
              create: () => true,
              update: () => true,
              delete: () => true,
            },
            before: {},
            after: {},
            actions: {},
            relations: {},
          },
        ] as never[],
      });
    }

    describe('When calling requestHandler with /api/auth/session path', () => {
      it('Then routes to auth.handler', async () => {
        const app = createTestServer();
        const response = await app.requestHandler(new Request('http://localhost/api/auth/session'));
        const body = await response.json();
        // Auth session endpoint returns { session: ... } — proves routing to auth handler
        // Entity handler would return { items: [...] } or 404
        expect(body).toHaveProperty('session');
      });
    });

    describe('When calling requestHandler with /api/users path', () => {
      it('Then routes to entity handler', async () => {
        const app = createTestServer();
        const response = await app.requestHandler(new Request('http://localhost/api/users'));
        expect(response.status).toBe(200);
        const body = await response.json();
        // Entity handler returns items array
        expect(body).toHaveProperty('items');
      });
    });

    describe('When calling requestHandler with /api/auth/oauth/github path', () => {
      it('Then routes to auth.handler (nested auth path)', async () => {
        const app = createTestServer();
        const response = await app.requestHandler(
          new Request('http://localhost/api/auth/oauth/github'),
        );
        // Auth handler handles this (returns error for unconfigured provider)
        // Key: response comes from auth handler, not entity handler
        const body = await response.json();
        expect(body).toHaveProperty('error');
        // Auth handler says "Provider not found" for unknown providers
        expect(body.error).toContain('Provider');
      });
    });

    describe('When calling requestHandler with /api/auth (exact match, no trailing path)', () => {
      it('Then routes to auth.handler', async () => {
        const app = createTestServer();
        const response = await app.requestHandler(new Request('http://localhost/api/auth'));
        // Auth handler handles /api/auth (returns 404 for unknown sub-route internally)
        // Key: it should NOT go to entity handler
        expect(response.status).toBe(404);
      });
    });

    describe('When calling requestHandler with /api/authorize (false prefix match)', () => {
      it('Then routes to entity handler, NOT auth handler', async () => {
        const app = createTestServer();
        const response = await app.requestHandler(new Request('http://localhost/api/authorize'));
        // Entity handler returns 404 for unknown entity
        expect(response.status).toBe(404);
      });
    });

    describe('When calling requestHandler with /api/auth/ (trailing slash)', () => {
      it('Then routes to auth.handler', async () => {
        const app = createTestServer();
        const response = await app.requestHandler(new Request('http://localhost/api/auth/'));
        // Auth handler handles this (strips prefix, gets "/" — returns 404 for unknown route)
        expect(response.status).toBe(404);
      });
    });

    describe('When accessing requestHandler multiple times', () => {
      it('Then returns the same cached function (stable identity)', () => {
        const app = createTestServer();
        const handler1 = app.requestHandler;
        const handler2 = app.requestHandler;
        expect(handler1).toBe(handler2);
      });
    });
  });

  describe('Given a createServer call without auth (plain AppBuilder)', () => {
    it('Then the return type does not include requestHandler', () => {
      const app = createServer({
        basePath: '/',
        entities: [],
      });
      // @ts-expect-error — requestHandler does not exist on AppBuilder
      expect(app.requestHandler).toBeUndefined();
    });
  });

  describe('Given a custom apiPrefix with auth', () => {
    it('Then creates server successfully with custom prefix (#2131)', () => {
      const db = createMockDatabaseClient();
      const app = createServer({
        basePath: '/',
        apiPrefix: '/v1',
        db,
        auth: authConfig,
        entities: [
          {
            kind: 'entity',
            name: 'users',
            model: usersModel,
            inject: {},
            access: {
              list: () => true,
            },
            before: {},
            after: {},
            actions: {},
            relations: {},
          },
        ] as never[],
      });
      expect(app).toBeDefined();
      expect(app.requestHandler).toBeTypeOf('function');
    });
  });
});
