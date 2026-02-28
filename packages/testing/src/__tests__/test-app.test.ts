import { s } from '@vertz/schema';
import {
  createMiddleware,
  createModule,
  createModuleDef,
  type HandlerCtx,
  type NamedModule,
  type NamedRouterDef,
  type NamedServiceDef,
} from '@vertz/server';
import { describe, expect, it } from 'vitest';

import { createTestApp } from '../test-app';

interface RouteInput {
  method: string;
  path: string;
  handler: (ctx: HandlerCtx) => unknown;
  response?: unknown;
}

function addRoutes(router: NamedRouterDef, routes: RouteInput[]): void {
  for (const route of routes) {
    const method = route.method.toLowerCase() as
      | 'get'
      | 'post'
      | 'put'
      | 'patch'
      | 'delete'
      | 'head';
    router[method](route.path, { handler: route.handler, response: route.response });
  }
}

function createTestModule(name: string, prefix: string, routes: RouteInput[]): NamedModule {
  const moduleDef = createModuleDef({ name });
  const router = moduleDef.router({ prefix });
  addRoutes(router, routes);
  return createModule(moduleDef, { services: [], routers: [router], exports: [] });
}

function createModuleWithService(
  name: string,
  prefix: string,
  serviceDef: {
    methods: (deps: Record<string, unknown>, state: unknown) => Record<string, unknown>;
  },
  routes: RouteInput[],
): { module: NamedModule; service: NamedServiceDef } {
  const moduleDef = createModuleDef({ name });
  const service = moduleDef.service(serviceDef);
  const router = moduleDef.router({ prefix, inject: { svc: service } });
  addRoutes(router, routes);
  const mod = createModule(moduleDef, { services: [service], routers: [router], exports: [] });
  return { module: mod, service };
}

describe('createTestApp', () => {
  it('returns a builder with register, mock, mockMiddleware, and HTTP methods', () => {
    const app = createTestApp();

    expect(app.register).toBeTypeOf('function');
    expect(app.mock).toBeTypeOf('function');
    expect(app.mockMiddleware).toBeTypeOf('function');
    expect(app.get).toBeTypeOf('function');
    expect(app.post).toBeTypeOf('function');
    expect(app.put).toBeTypeOf('function');
    expect(app.patch).toBeTypeOf('function');
    expect(app.delete).toBeTypeOf('function');
    expect(app.head).toBeTypeOf('function');
  });

  it('executes a GET request and returns response', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'GET', path: '/', handler: () => ({ users: ['Jane', 'John'] }) },
    ]);

    const app = createTestApp().register(mod);
    const res = await app.get('/users');

    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.body).toEqual({ users: ['Jane', 'John'] });
  });

  it('executes a POST request with body', async () => {
    const mod = createTestModule('test', '/users', [
      {
        method: 'POST',
        path: '/',
        handler: (ctx) => ({ created: (ctx.body as Record<string, unknown>).name }),
      },
    ]);

    const app = createTestApp().register(mod);
    const res = await app.post('/users', { body: { name: 'Alice' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: 'Alice' });
  });

  it('passes route params to handler via ctx', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'GET', path: '/:id', handler: (ctx) => ({ userId: ctx.params.id }) },
    ]);

    const app = createTestApp().register(mod);
    const res = await app.get('/users/42');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: '42' });
  });

  it('returns 404 for unmatched route', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'GET', path: '/', handler: () => ({ ok: true }) },
    ]);

    const app = createTestApp().register(mod);
    const res = await app.get('/not-found');

    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);
  });

  it('passes env overrides to handler via ctx', async () => {
    const mod = createTestModule('test', '/api', [
      { method: 'GET', path: '/', handler: (ctx) => ({ dbUrl: ctx.env.DATABASE_URL }) },
    ]);

    const app = createTestApp().env({ DATABASE_URL: 'postgres://test' }).register(mod);

    const res = await app.get('/api');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ dbUrl: 'postgres://test' });
  });

  it('uses mocked middleware result instead of running real middleware', async () => {
    const authMiddleware = createMiddleware({
      name: 'auth',
      handler: () => {
        throw new Error('should not run');
      },
    });

    const mod = createTestModule('test', '/api', [
      { method: 'GET', path: '/', handler: (ctx) => ({ user: ctx.user }) },
    ]);

    const app = createTestApp()
      .mockMiddleware(authMiddleware, { user: { id: '1', role: 'admin' } })
      .register(mod);

    const res = await app.get('/api');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: '1', role: 'admin' } });
  });

  it('supports per-request middleware override', async () => {
    const authMiddleware = createMiddleware({
      name: 'auth',
      handler: () => {
        throw new Error('should not run');
      },
    });

    const mod = createTestModule('test', '/api', [
      {
        method: 'GET',
        path: '/',
        handler: (ctx) => ({ role: (ctx.user as Record<string, string>).role }),
      },
    ]);

    const app = createTestApp()
      .mockMiddleware(authMiddleware, { user: { id: '1', role: 'admin' } })
      .register(mod);

    // Per-request override — different user role
    const res = await app
      .get('/api')
      .mockMiddleware(authMiddleware, { user: { id: '2', role: 'viewer' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ role: 'viewer' });
  });

  it('passes custom headers to handler via ctx', async () => {
    const mod = createTestModule('test', '/api', [
      {
        method: 'GET',
        path: '/',
        handler: (ctx) => ({ token: ctx.headers.authorization }),
      },
    ]);

    const app = createTestApp().register(mod);
    const res = await app.get('/api', { headers: { authorization: 'Bearer test-token' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: 'Bearer test-token' });
  });

  it('executes a PUT request with body', async () => {
    const mod = createTestModule('test', '/users', [
      {
        method: 'PUT',
        path: '/:id',
        handler: (ctx) => ({
          updated: ctx.params.id,
          name: (ctx.body as Record<string, unknown>).name,
        }),
      },
    ]);

    const app = createTestApp().register(mod);
    const res = await app.put('/users/42', { body: { name: 'Updated' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: '42', name: 'Updated' });
  });

  it('executes a PATCH request with body', async () => {
    const mod = createTestModule('test', '/users', [
      {
        method: 'PATCH',
        path: '/:id',
        handler: (ctx) => ({
          patched: ctx.params.id,
          email: (ctx.body as Record<string, unknown>).email,
        }),
      },
    ]);

    const app = createTestApp().register(mod);
    const res = await app.patch('/users/42', { body: { email: 'new@test.com' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ patched: '42', email: 'new@test.com' });
  });

  it('executes a DELETE request', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'DELETE', path: '/:id', handler: (ctx) => ({ deleted: ctx.params.id }) },
    ]);

    const app = createTestApp().register(mod);
    const res = await app.delete('/users/42');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: '42' });
  });

  it('executes a HEAD request', async () => {
    const mod = createTestModule('test', '/health', [
      { method: 'HEAD', path: '/', handler: () => ({ ok: true }) },
    ]);

    const app = createTestApp().register(mod);
    const res = await app.head('/health');

    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
  });

  it('uses mocked service instead of real one', async () => {
    const { module: mod, service } = createModuleWithService(
      'test',
      '/api',
      { methods: () => ({ greet: () => 'real' }) },
      [
        {
          method: 'GET',
          path: '/',
          handler: (ctx) => ({ message: (ctx.svc as Record<string, () => string>).greet() }),
        },
      ],
    );

    const app = createTestApp()
      .mock(service, { greet: () => 'mocked' })
      .register(mod);

    const res = await app.get('/api');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'mocked' });
  });

  it('per-request service mock overrides app-level mock', async () => {
    const { module: mod, service } = createModuleWithService(
      'test',
      '/api',
      { methods: () => ({ greet: () => 'real' }) },
      [
        {
          method: 'GET',
          path: '/',
          handler: (ctx) => ({ message: (ctx.svc as Record<string, () => string>).greet() }),
        },
      ],
    );

    const app = createTestApp()
      .mock(service, { greet: () => 'app-level' })
      .register(mod);

    const res = await app.get('/api').mock(service, { greet: () => 'per-request' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'per-request' });
  });

  it('app-level service mock applies when no per-request override', async () => {
    const { module: mod, service } = createModuleWithService(
      'test',
      '/api',
      { methods: () => ({ greet: () => 'real' }) },
      [
        {
          method: 'GET',
          path: '/',
          handler: (ctx) => ({ message: (ctx.svc as Record<string, () => string>).greet() }),
        },
      ],
    );

    const app = createTestApp()
      .mock(service, { greet: () => 'app-level' })
      .register(mod);

    // No per-request override — app-level mock should be used
    const res = await app.get('/api');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'app-level' });
  });

  it('passes when handler return matches response schema', async () => {
    const mod = createTestModule('test', '/api', [
      {
        method: 'GET',
        path: '/',
        response: s.object({ name: s.string() }),
        handler: () => ({ name: 'Alice' }),
      },
    ]);

    const app = createTestApp().register(mod);
    const res = await app.get('/api');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Alice' });
  });

  it('skips validation when route has no response schema', async () => {
    const mod = createTestModule('test', '/api', [
      { method: 'GET', path: '/', handler: () => ({ anything: 'goes' }) },
    ]);

    const app = createTestApp().register(mod);
    const res = await app.get('/api');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ anything: 'goes' });
  });

  it('throws when handler returns undefined but route has response schema', async () => {
    const mod = createTestModule('test', '/api', [
      {
        method: 'GET',
        path: '/',
        response: s.object({ name: s.string() }),
        handler: () => undefined,
      },
    ]);

    const app = createTestApp().register(mod);

    await expect(Promise.resolve(app.get('/api'))).rejects.toThrow('Response validation failed');
  });

  it('throws when handler return does not match response schema', async () => {
    const mod = createTestModule('test', '/api', [
      {
        method: 'GET',
        path: '/',
        response: s.object({ name: s.string() }),
        handler: () => ({ name: 123 }),
      },
    ]);

    const app = createTestApp().register(mod);

    await expect(Promise.resolve(app.get('/api'))).rejects.toThrow('Response validation failed');
  });

  it('throws ResponseValidationError with error message from safeParse', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/api' });

    const responseSchema = {
      safeParse: (value: unknown) => {
        const v = value as { name: unknown };
        if (typeof v?.name !== 'string') {
          return { ok: false as const, error: { message: 'name must be a string' } };
        }
        return { ok: true as const };
      },
    };

    router.get('/', {
      response: responseSchema,
      handler: () => ({ name: 42 }),
    });

    const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createTestApp().register(mod);

    await expect(Promise.resolve(app.get('/api'))).rejects.toThrow(
      'Response validation failed: name must be a string',
    );
  });

  it('throws ResponseValidationError with fallback message when error has no message', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/api' });

    const responseSchema = {
      safeParse: () => {
        return { ok: false as const };
      },
    };

    router.get('/', {
      response: responseSchema,
      handler: () => ({ name: 42 }),
    });

    const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createTestApp().register(mod);

    await expect(Promise.resolve(app.get('/api'))).rejects.toThrow(
      'Response validation failed: Unknown validation error',
    );
  });

  it('validates body using schema and rejects invalid input', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    const bodySchema = s.object({ name: s.string() });

    router.post('/', {
      body: bodySchema,
      handler: () => ({ created: true }),
    });

    const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createTestApp().register(mod);

    const res = await app.post('/users', { body: { name: 123 } });

    expect(res.status).toBe(400);
  });

  it('validates query using schema and rejects invalid input', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    const querySchema = {
      parse: (value: unknown) => {
        const query = value as Record<string, unknown>;
        const page = Number(query.page);
        if (Number.isNaN(page))
          return { ok: false as const, error: new Error('page must be a number') };
        return { ok: true as const, data: { page } };
      },
    };

    router.get('/', {
      query: querySchema,
      handler: () => ({ users: [] }),
    });

    const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createTestApp().register(mod);

    const res = await app.get('/users?page=abc');

    expect(res.status).toBe(400);
  });

  it('validates headers using schema and rejects invalid input', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/data' });

    const headersSchema = {
      parse: (value: unknown) => {
        const headers = value as Record<string, unknown>;
        if (!headers['x-api-key'])
          return { ok: false as const, error: new Error('x-api-key is required') };
        return { ok: true as const, data: headers };
      },
    };

    router.get('/', {
      headers: headersSchema,
      handler: () => ({ data: [] }),
    });

    const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createTestApp().register(mod);

    const res = await app.get('/data');

    expect(res.status).toBe(400);
  });
});
