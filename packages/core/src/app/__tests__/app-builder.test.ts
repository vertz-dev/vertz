import { afterEach, describe, expect, it } from 'bun:test';
import { NotFoundException, UnauthorizedException } from '../../exceptions';
import { createMiddleware } from '../../middleware/middleware-def';
import { createModule } from '../../module/module';
import { createModuleDef } from '../../module/module-def';
import type { HandlerCtx } from '../../types/context';
import { createApp } from '../app-builder';

interface TestRoute {
  method: string;
  path: string;
  handler: (ctx: HandlerCtx) => unknown;
}

function createTestModule(name: string, prefix: string, routes: TestRoute[]) {
  const moduleDef = createModuleDef({ name });
  const router = moduleDef.router({ prefix });
  for (const route of routes) {
    const method = route.method.toLowerCase() as
      | 'get'
      | 'post'
      | 'put'
      | 'patch'
      | 'delete'
      | 'head';
    router[method](route.path, { handler: route.handler });
  }
  return createModule(moduleDef, { services: [], routers: [router], exports: [] });
}

describe('createApp', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('returns a builder with register, middlewares, and handler', () => {
    const app = createApp({ basePath: '/api' });

    expect(app.register).toBeTypeOf('function');
    expect(app.middlewares).toBeTypeOf('function');
    expect(app).toHaveProperty('handler');
  });

  it('routes a GET request to the correct handler and returns JSON', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'GET', path: '/', handler: () => ({ users: [] }) },
    ]);

    const app = createApp({}).register(mod);
    const res = await app.handler(new Request('http://localhost/users'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [] });
  });

  it('returns 404 for unmatched route', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'GET', path: '/', handler: () => ({ users: [] }) },
    ]);

    const app = createApp({}).register(mod);
    const res = await app.handler(new Request('http://localhost/unknown'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NotFound');
  });

  it('passes parsed params to route handler via ctx', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'GET', path: '/:id', handler: (ctx) => ({ id: ctx.params.id }) },
    ]);

    const app = createApp({}).register(mod);
    const res = await app.handler(new Request('http://localhost/users/42'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '42' });
  });

  it('parses request body for POST routes', async () => {
    const mod = createTestModule('test', '/users', [
      {
        method: 'POST',
        path: '/',
        handler: (ctx) => ({ created: (ctx.body as Record<string, unknown>).name }),
      },
    ]);

    const app = createApp({}).register(mod);
    const res = await app.handler(
      new Request('http://localhost/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Jane' }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: 'Jane' });
  });

  it('handles VertzException and returns correct status code', async () => {
    const mod = createTestModule('test', '/users', [
      {
        method: 'GET',
        path: '/:id',
        handler: () => {
          throw new NotFoundException('User not found');
        },
      },
    ]);

    const app = createApp({}).register(mod);
    const res = await app.handler(new Request('http://localhost/users/42'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe('User not found');
    expect(body.error.code).toBe('NotFound');
  });

  it('handles unexpected errors with 500', async () => {
    const mod = createTestModule('test', '/users', [
      {
        method: 'GET',
        path: '/',
        handler: () => {
          throw new Error('unexpected');
        },
      },
    ]);

    const app = createApp({}).register(mod);
    const res = await app.handler(new Request('http://localhost/users'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('InternalServerError');
  });

  it('returns 405 with Allow header for wrong HTTP method', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'GET', path: '/', handler: () => ({ users: [] }) },
    ]);

    const app = createApp({}).register(mod);
    const res = await app.handler(new Request('http://localhost/users', { method: 'DELETE' }));

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('registers multiple modules and combines their routes', async () => {
    const userMod = createTestModule('users', '/users', [
      { method: 'GET', path: '/', handler: () => ({ type: 'users' }) },
    ]);
    const orderMod = createTestModule('orders', '/orders', [
      { method: 'GET', path: '/', handler: () => ({ type: 'orders' }) },
    ]);

    const app = createApp({}).register(userMod).register(orderMod);

    const usersRes = await app.handler(new Request('http://localhost/users'));
    expect(await usersRes.json()).toEqual({ type: 'users' });

    const ordersRes = await app.handler(new Request('http://localhost/orders'));
    expect(await ordersRes.json()).toEqual({ type: 'orders' });
  });

  it('handles CORS preflight with 204', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'GET', path: '/', handler: () => ({ users: [] }) },
    ]);

    const app = createApp({ cors: { origins: true } }).register(mod);
    const res = await app.handler(
      new Request('http://localhost/users', {
        method: 'OPTIONS',
        headers: { origin: 'http://example.com' },
      }),
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('runs middleware chain and provides contributions to handler ctx', async () => {
    const authMiddleware = createMiddleware({
      name: 'auth',
      handler: () => ({ user: { id: '1', role: 'admin' } }),
    });

    const mod = createTestModule('test', '/users', [
      {
        method: 'GET',
        path: '/',
        handler: (ctx) => ({ userId: (ctx.user as Record<string, string>).id }),
      },
    ]);

    const app = createApp({}).middlewares([authMiddleware]).register(mod);
    const res = await app.handler(new Request('http://localhost/users'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: '1' });
  });

  it('returns 204 when handler returns undefined', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'POST', path: '/:id/activate', handler: () => undefined },
    ]);

    const app = createApp({}).register(mod);
    const res = await app.handler(
      new Request('http://localhost/users/42/activate', { method: 'POST' }),
    );

    expect(res.status).toBe(204);
  });

  it('short-circuits when middleware throws VertzException', async () => {
    const authMiddleware = createMiddleware({
      name: 'auth',
      handler: () => {
        throw new UnauthorizedException('Invalid token');
      },
    });

    const mod = createTestModule('test', '/users', [
      { method: 'GET', path: '/', handler: () => ({ users: [] }) },
    ]);

    const app = createApp({}).middlewares([authMiddleware]).register(mod);
    const res = await app.handler(new Request('http://localhost/users'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('Invalid token');
  });

  it('prepends basePath to all routes', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'GET', path: '/', handler: () => ({ users: [] }) },
    ]);

    const app = createApp({ basePath: '/api' }).register(mod);

    const res = await app.handler(new Request('http://localhost/api/users'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [] });

    const miss = await app.handler(new Request('http://localhost/users'));
    expect(miss.status).toBe(404);
  });

  it('injects services into handler ctx via router inject', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const userService = moduleDef.service({
      methods: () => ({
        findById: (id: string) => ({ id, name: 'Jane' }),
      }),
    });
    const router = moduleDef.router({ prefix: '/users', inject: { userService } });
    router.get('/:id', {
      handler: (ctx) => {
        const svc = ctx.userService as { findById: (id: string) => unknown };
        return svc.findById(ctx.params.id);
      },
    });
    const mod = createModule(moduleDef, {
      services: [userService],
      routers: [router],
      exports: [userService],
    });

    const app = createApp({}).register(mod);
    const res = await app.handler(new Request('http://localhost/users/42'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '42', name: 'Jane' });
  });

  it('provides module options via ctx.options', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'GET', path: '/', handler: (ctx) => ({ maxRetries: ctx.options.maxRetries }) },
    ]);

    const app = createApp({}).register(mod, { maxRetries: 3 });
    const res = await app.handler(new Request('http://localhost/users'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ maxRetries: 3 });
  });

  it('provides immutable ctx in development mode', async () => {
    process.env.NODE_ENV = 'development';

    let mutationThrew = false;
    const mod = createTestModule('test', '/users', [
      {
        method: 'GET',
        path: '/',
        handler: (ctx) => {
          try {
            (ctx as Record<string, unknown>).params = 'mutated';
          } catch {
            mutationThrew = true;
          }
          return { ok: true };
        },
      },
    ]);

    const app = createApp({}).register(mod);
    await app.handler(new Request('http://localhost/users'));

    expect(mutationThrew).toBe(true);
  });

  it('applies CORS headers to actual responses', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'GET', path: '/', handler: () => ({ users: [] }) },
    ]);

    const app = createApp({ cors: { origins: true } }).register(mod);
    const res = await app.handler(
      new Request('http://localhost/users', {
        headers: { origin: 'http://example.com' },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  describe('handler caching', () => {
    it('returns the same handler reference on repeated accesses', () => {
      const mod = createTestModule('test', '/users', [
        { method: 'GET', path: '/', handler: () => ({ users: [] }) },
      ]);

      const app = createApp({}).register(mod);
      const first = app.handler;
      const second = app.handler;

      expect(first).toBe(second);
    });

    it('returns a new handler reference after registering a new module', async () => {
      const mod1 = createTestModule('mod1', '/users', [
        { method: 'GET', path: '/', handler: () => ({ type: 'users' }) },
      ]);
      const mod2 = createTestModule('mod2', '/orders', [
        { method: 'GET', path: '/', handler: () => ({ type: 'orders' }) },
      ]);

      const app = createApp({}).register(mod1);
      const before = app.handler;

      app.register(mod2);
      const after = app.handler;

      expect(before).not.toBe(after);

      // Verify the new handler actually routes the second module's routes
      const res = await after(new Request('http://localhost/orders'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ type: 'orders' });
    });
  });

  describe('router.routes inspection', () => {
    it('exposes registered routes with correct method and path', () => {
      const mod = createTestModule('test', '/users', [
        { method: 'GET', path: '/', handler: () => ({ users: [] }) },
        { method: 'POST', path: '/', handler: () => ({ created: true }) },
        { method: 'GET', path: '/:id', handler: () => ({ user: {} }) },
      ]);

      const app = createApp({}).register(mod);
      const routes = app.router.routes;

      expect(routes).toContainEqual({ method: 'GET', path: '/users/' });
      expect(routes).toContainEqual({ method: 'POST', path: '/users/' });
      expect(routes).toContainEqual({ method: 'GET', path: '/users/:id' });
    });

    it('does not prepend basePath to router.routes (basePath is applied at request dispatch time)', () => {
      // Note: basePath affects request routing but router.routes uses the router prefix directly
      // (basePath is applied at request-dispatch time, not at registration time)
      // This test verifies the raw prefix + path stored in router.routes
      const mod = createTestModule('test', '/users', [
        { method: 'GET', path: '/', handler: () => ({ users: [] }) },
      ]);

      const app = createApp({ basePath: '/api' }).register(mod);
      const routes = app.router.routes;

      expect(routes).toContainEqual({ method: 'GET', path: '/users/' });
    });

    it('accumulates routes from multiple registered modules', () => {
      const userMod = createTestModule('users', '/users', [
        { method: 'GET', path: '/', handler: () => ({ type: 'users' }) },
        { method: 'POST', path: '/', handler: () => ({ created: true }) },
      ]);
      const orderMod = createTestModule('orders', '/orders', [
        { method: 'GET', path: '/', handler: () => ({ type: 'orders' }) },
        { method: 'DELETE', path: '/:id', handler: () => undefined },
      ]);

      const app = createApp({}).register(userMod).register(orderMod);
      const routes = app.router.routes;

      expect(routes).toContainEqual({ method: 'GET', path: '/users/' });
      expect(routes).toContainEqual({ method: 'POST', path: '/users/' });
      expect(routes).toContainEqual({ method: 'GET', path: '/orders/' });
      expect(routes).toContainEqual({ method: 'DELETE', path: '/orders/:id' });
    });

    it('returns an empty routes array when no modules are registered', () => {
      const app = createApp({});
      expect(app.router.routes).toEqual([]);
    });
  });

  describe('entity routes', () => {
    it('exposes entity CRUD routes via _entityRoutes when provided', () => {
      const entityRoutes = [
        { method: 'GET', path: '/api/posts', handler: async () => new Response('[]') },
        { method: 'POST', path: '/api/posts', handler: async () => new Response('{}') },
        { method: 'GET', path: '/api/posts/:id', handler: async () => new Response('{}') },
        { method: 'PATCH', path: '/api/posts/:id', handler: async () => new Response('{}') },
        { method: 'DELETE', path: '/api/posts/:id', handler: async () => new Response() },
      ];

      const app = createApp({ _entityRoutes: entityRoutes });
      const routes = app.router.routes;

      expect(routes).toHaveLength(5);
      expect(routes).toContainEqual({ method: 'GET', path: '/api/posts' });
      expect(routes).toContainEqual({ method: 'POST', path: '/api/posts' });
      expect(routes).toContainEqual({ method: 'GET', path: '/api/posts/:id' });
      expect(routes).toContainEqual({ method: 'PATCH', path: '/api/posts/:id' });
      expect(routes).toContainEqual({ method: 'DELETE', path: '/api/posts/:id' });
    });

    it('generates CRUD routes from entities config when _entityRoutes is absent', () => {
      const postEntity = {
        name: 'posts',
        model: {},
        access: {},
        before: {},
        after: {},
        actions: {},
        relations: {},
      };

      const app = createApp({ entities: [postEntity] });
      const routes = app.router.routes;

      expect(routes).toHaveLength(5);
      expect(routes).toContainEqual({ method: 'GET', path: '/api/posts' });
      expect(routes).toContainEqual({ method: 'GET', path: '/api/posts/:id' });
      expect(routes).toContainEqual({ method: 'POST', path: '/api/posts' });
      expect(routes).toContainEqual({ method: 'PATCH', path: '/api/posts/:id' });
      expect(routes).toContainEqual({ method: 'DELETE', path: '/api/posts/:id' });
    });

    it('generates action routes for entity actions', () => {
      const postEntity = {
        name: 'posts',
        model: {},
        access: {},
        before: {},
        after: {},
        actions: { publish: {}, archive: {} },
        relations: {},
      };

      const app = createApp({ entities: [postEntity] });
      const routes = app.router.routes;

      expect(routes).toHaveLength(7);

      // Verify action routes are generated
      expect(routes).toContainEqual({ method: 'POST', path: '/api/posts/:id/publish' });
      expect(routes).toContainEqual({ method: 'POST', path: '/api/posts/:id/archive' });

      // Verify CRUD routes are still present — a regression that emits actions but drops CRUD would fail here
      expect(routes).toContainEqual({ method: 'GET', path: '/api/posts' });
      expect(routes).toContainEqual({ method: 'DELETE', path: '/api/posts/:id' });
    });

    it('respects custom apiPrefix for entity routes', () => {
      const postEntity = {
        name: 'posts',
        model: {},
        access: {},
        before: {},
        after: {},
        actions: {},
        relations: {},
      };

      const app = createApp({ entities: [postEntity], apiPrefix: '/v1/' });
      const routes = app.router.routes;

      expect(routes).toHaveLength(5);
      // Collection routes
      expect(routes).toContainEqual({ method: 'GET', path: '/v1/posts' });
      expect(routes).toContainEqual({ method: 'POST', path: '/v1/posts' });
      // Parameterized routes — /:id path construction is a distinct code path
      expect(routes).toContainEqual({ method: 'GET', path: '/v1/posts/:id' });
      expect(routes).toContainEqual({ method: 'PATCH', path: '/v1/posts/:id' });
      expect(routes).toContainEqual({ method: 'DELETE', path: '/v1/posts/:id' });
    });

    it('uses root-level entity path when apiPrefix is empty string', () => {
      const postEntity = {
        name: 'posts',
        model: {},
        access: {},
        before: {},
        after: {},
        actions: {},
        relations: {},
      };

      const app = createApp({ entities: [postEntity], apiPrefix: '' });
      const routes = app.router.routes;

      expect(routes).toHaveLength(5);
      // Collection routes
      expect(routes).toContainEqual({ method: 'GET', path: '/posts' });
      expect(routes).toContainEqual({ method: 'POST', path: '/posts' });
      // Parameterized routes — /:id path construction is a distinct code path
      expect(routes).toContainEqual({ method: 'GET', path: '/posts/:id' });
      expect(routes).toContainEqual({ method: 'PATCH', path: '/posts/:id' });
      expect(routes).toContainEqual({ method: 'DELETE', path: '/posts/:id' });
    });
  });
});
