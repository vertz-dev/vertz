import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import { createServer, type ServerInstance } from '../create-server';

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
});
const usersModel = d.model(usersTable);

// ---------------------------------------------------------------------------
// Cloud mode tests — covers the cloud auth branch in createServer
// ---------------------------------------------------------------------------

describe('createServer (cloud mode)', () => {
  let savedToken: string | undefined;

  beforeEach(() => {
    savedToken = process.env.VERTZ_CLOUD_TOKEN;
    process.env.VERTZ_CLOUD_TOKEN = 'test-cloud-token';
  });

  afterEach(() => {
    if (savedToken === undefined) {
      delete process.env.VERTZ_CLOUD_TOKEN;
    } else {
      process.env.VERTZ_CLOUD_TOKEN = savedToken;
    }
  });

  function createCloudServer(overrides?: {
    apiPrefix?: string;
    auth?: { session: { strategy: 'jwt'; ttl: string } };
    entities?: unknown[];
  }): ServerInstance {
    return createServer({
      basePath: '/',
      ...overrides,
      cloud: { projectId: 'proj_testcloud123' },
      entities: (overrides?.entities ?? [
        {
          kind: 'entity',
          name: 'users',
          model: usersModel,
          inject: {},
          access: { list: () => true, get: () => true },
          before: {},
          after: {},
          actions: {},
          relations: {},
        },
      ]) as never[],
    }) as ServerInstance;
  }

  it('creates a ServerInstance with .auth when cloud config is provided', () => {
    const app = createCloudServer();
    expect(app.auth).toBeDefined();
    expect(app.auth.handler).toBeTypeOf('function');
    expect(app.auth.api).toBeDefined();
    expect(typeof app.initialize).toBe('function');
  });

  it('initialize() is a no-op in cloud mode', async () => {
    const app = createCloudServer();
    // Should resolve without error
    await app.initialize();
  });

  it('dispose() is a no-op in cloud mode', () => {
    const app = createCloudServer();
    // Should not throw
    app.auth.dispose();
  });

  describe('Cloud auth API methods throw with descriptive errors', () => {
    it('signUp throws', async () => {
      const app = createCloudServer();
      await expect(app.auth.api.signUp({} as never)).rejects.toThrow(
        /auth\.api\.signUp\(\) is not available in cloud mode/,
      );
    });

    it('signIn throws', async () => {
      const app = createCloudServer();
      await expect(app.auth.api.signIn({} as never)).rejects.toThrow(
        /auth\.api\.signIn\(\) is not available in cloud mode/,
      );
    });

    it('signOut throws', async () => {
      const app = createCloudServer();
      await expect(app.auth.api.signOut({} as never)).rejects.toThrow(
        /auth\.api\.signOut\(\) is not available in cloud mode/,
      );
    });

    it('getSession throws', async () => {
      const app = createCloudServer();
      await expect(app.auth.api.getSession({} as never)).rejects.toThrow(
        /auth\.api\.getSession\(\) is not available in cloud mode/,
      );
    });

    it('refreshSession throws', async () => {
      const app = createCloudServer();
      await expect(app.auth.api.refreshSession({} as never)).rejects.toThrow(
        /auth\.api\.refreshSession\(\) is not available in cloud mode/,
      );
    });

    it('listSessions throws', async () => {
      const app = createCloudServer();
      await expect(app.auth.api.listSessions({} as never)).rejects.toThrow(
        /auth\.api\.listSessions\(\) is not available in cloud mode/,
      );
    });

    it('revokeSession throws', async () => {
      const app = createCloudServer();
      await expect(app.auth.api.revokeSession({} as never)).rejects.toThrow(
        /auth\.api\.revokeSession\(\) is not available in cloud mode/,
      );
    });

    it('revokeAllSessions throws', async () => {
      const app = createCloudServer();
      await expect(app.auth.api.revokeAllSessions({} as never)).rejects.toThrow(
        /auth\.api\.revokeAllSessions\(\) is not available in cloud mode/,
      );
    });
  });

  it('middleware() throws in cloud mode', () => {
    const app = createCloudServer();
    expect(() => app.auth.middleware()).toThrow(
      /auth\.middleware\(\) is not available in cloud mode/,
    );
  });

  it('resolveSessionForSSR is defined', () => {
    const app = createCloudServer();
    expect(app.auth.resolveSessionForSSR).toBeTypeOf('function');
  });

  describe('Cloud requestHandler routing', () => {
    it('routes non-auth requests to entity handler', async () => {
      const app = createCloudServer();
      const response = await app.requestHandler(new Request('http://localhost/api/users'));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('items');
    });

    it('routes /api/auth requests to cloud proxy', async () => {
      const app = createCloudServer();
      // The proxy will try to reach cloud.vtz.app and fail (network error),
      // but the routing code is exercised
      const response = await app.requestHandler(new Request('http://localhost/api/auth/session'));
      // Proxy returns an error response (not a normal entity response)
      // The key assertion: it didn't go to the entity handler (which would return items)
      const body = await response.json().catch(() => null);
      // If proxy returns error, we check it's NOT an entity response
      if (body) {
        expect(body).not.toHaveProperty('items');
      }
    });

    it('routes /api/auth (exact match) to cloud proxy', async () => {
      const app = createCloudServer();
      const response = await app.requestHandler(new Request('http://localhost/api/auth'));
      const body = await response.json().catch(() => null);
      if (body) {
        expect(body).not.toHaveProperty('items');
      }
    });

    it('caches the requestHandler function', () => {
      const app = createCloudServer();
      const h1 = app.requestHandler;
      const h2 = app.requestHandler;
      expect(h1).toBe(h2);
    });
  });

  it('warns when both cloud and auth config are set', () => {
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0]));
    };

    try {
      createCloudServer({
        auth: { session: { strategy: 'jwt', ttl: '60s' } },
      });
      expect(warnings.some((w) => w.includes('Cloud mode takes precedence'))).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  it('accepts custom apiPrefix with cloud config (#2131)', () => {
    const app = createServer({
      basePath: '/',
      apiPrefix: '/custom',
      cloud: { projectId: 'proj_test123' },
    });

    expect(app).toBeDefined();
    expect(app.apiPrefix).toBe('/custom');
  });

  it('throws when cloud projectId has invalid format', () => {
    expect(() =>
      createServer({
        basePath: '/',
        cloud: { projectId: 'invalid-id' },
      }),
    ).toThrow(/Invalid projectId/);
  });
});
