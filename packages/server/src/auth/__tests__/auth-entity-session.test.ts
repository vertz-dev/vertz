import { Database } from '@vertz/sqlite';
import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { createDb, d } from '@vertz/db';
import { createServer, type ServerInstance } from '../../create-server';
import { entity } from '../../entity/entity';
import { authModels } from '../auth-models';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  tenantId: d.text(),
});

const tasksModel = d.model(tasksTable);

const tasksEntity = entity('tasks', {
  model: tasksModel,
  access: {
    list: (ctx) => ctx.authenticated(),
    get: (ctx) => ctx.authenticated(),
    create: (ctx) => ctx.authenticated(),
    update: (ctx) => ctx.authenticated(),
    delete: false,
  },
});

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function createSqliteDb() {
  const rawDb = new Database(':memory:');
  const queryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
    const sqliteSql = sqlStr.replace(/\$\d+/g, '?');
    const trimmed = sqliteSql.trim();
    const isSelect = /^\s*SELECT/i.test(trimmed);
    const hasReturning = /RETURNING/i.test(trimmed);
    if (isSelect || hasReturning) {
      const stmt = rawDb.prepare(sqliteSql);
      const rows = stmt.all(...(params as unknown[])) as T[];
      return { rows, rowCount: rows.length };
    }
    const stmt = rawDb.prepare(sqliteSql);
    const info = stmt.run(...(params as unknown[]));
    return { rows: [] as T[], rowCount: info.changes };
  };

  const d1 = {
    prepare: () => {
      throw new Error('stub');
    },
  } as unknown as import('@vertz/db').D1Database;

  return {
    db: createDb({
      models: { ...authModels, tasks: tasksModel },
      dialect: 'sqlite',
      d1,
      _queryFn: queryFn,
    }),
    rawDb,
  };
}

function createTasksTable(rawDb: Database) {
  rawDb.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      tenant_id TEXT NOT NULL
    )
  `);
}

function seedTasks(rawDb: Database) {
  rawDb.run(`INSERT INTO tasks (id, title, tenant_id) VALUES ('1', 'Task A', 'tenant-a')`);
  rawDb.run(`INSERT INTO tasks (id, title, tenant_id) VALUES ('2', 'Task B', 'tenant-b')`);
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function makeAuthRequest(
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

function makeEntityRequest(
  method: string,
  path: string,
  cookies = '',
  body?: Record<string, unknown>,
): Request {
  const headers: Record<string, string> = {};
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  if (cookies) {
    headers.Cookie = cookies;
  }
  return new Request(`http://localhost/api${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
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

describe('createServer auto-wires auth session into entity context', () => {
  let server: ServerInstance;
  let rawDb: Database;

  beforeEach(async () => {
    const sqlite = createSqliteDb();
    rawDb = sqlite.rawDb;

    server = createServer({
      entities: [tasksEntity],
      db: sqlite.db,
      auth: {
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
      },
    });

    await server.initialize();
    createTasksTable(rawDb);
    seedTasks(rawDb);
  });

  afterEach(() => {
    server.auth.dispose();
    rawDb.close();
  });

  describe('Given a request with no session', () => {
    it('returns 403 for authenticated-only entity endpoint', async () => {
      const res = await server.requestHandler(makeEntityRequest('GET', '/tasks'));
      expect(res.status).toBe(403);
    });
  });

  describe('Given a valid session (signed-up user)', () => {
    it('provides ctx.userId to entity handlers — returns 200', async () => {
      // Sign up a user via auth handler
      const signupRes = await server.auth.handler(
        makeAuthRequest('POST', '/signup', {
          email: 'alice@example.com',
          password: 'Password123!',
        }),
      );
      expect(signupRes.status).toBe(201);
      const cookies = getCookies(signupRes);

      // Entity list should succeed (user is authenticated)
      const res = await server.requestHandler(makeEntityRequest('GET', '/tasks', cookies));
      expect(res.status).toBe(200);
    });
  });

  describe('Given a session with tenantId (after switch-tenant)', () => {
    it('provides ctx.tenantId to entity handlers — tenant filter applies', async () => {
      // Sign up
      const signupRes = await server.auth.handler(
        makeAuthRequest('POST', '/signup', {
          email: 'bob@example.com',
          password: 'Password123!',
        }),
      );
      const signupCookies = getCookies(signupRes);

      // Switch tenant
      const switchRes = await server.auth.handler(
        makeAuthRequest('POST', '/switch-tenant', { tenantId: 'tenant-a' }, signupCookies),
      );
      expect(switchRes.status).toBe(200);
      const tenantCookies = getCookies(switchRes);

      // Entity list should filter by tenant-a
      const res = await server.requestHandler(makeEntityRequest('GET', '/tasks', tenantCookies));
      expect(res.status).toBe(200);
      const body = await res.json();
      // Only task from tenant-a should be returned
      expect(body.items).toHaveLength(1);
      expect(body.items[0].title).toBe('Task A');
    });
  });

  describe('Given a session with tenantId for entity creation', () => {
    it('auto-sets tenantId on created entity', async () => {
      // Sign up
      const signupRes = await server.auth.handler(
        makeAuthRequest('POST', '/signup', {
          email: 'charlie@example.com',
          password: 'Password123!',
        }),
      );
      const signupCookies = getCookies(signupRes);

      // Switch tenant
      const switchRes = await server.auth.handler(
        makeAuthRequest('POST', '/switch-tenant', { tenantId: 'tenant-a' }, signupCookies),
      );
      const tenantCookies = getCookies(switchRes);

      // Create entity
      const res = await server.requestHandler(
        makeEntityRequest('POST', '/tasks', tenantCookies, { title: 'New Task' }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.tenantId).toBe('tenant-a');
    });
  });
});
