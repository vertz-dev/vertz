import { afterEach, describe, expect, it } from '@vertz/test';
import { NotFoundException, UnauthorizedException } from '../../exceptions';
import { createMiddleware } from '../../middleware/middleware-def';
import type { HandlerCtx } from '../../types/context';
import { createApp } from '../app-builder';

describe('createApp', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('returns a builder with middlewares and handler', () => {
    const app = createApp({ basePath: '/api' });

    expect(app.middlewares).toBeTypeOf('function');
    expect(app).toHaveProperty('handler');
  });

  it('routes a GET request to the correct handler and returns JSON', async () => {
    const app = createApp({
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          handler: async () =>
            new Response(JSON.stringify({ users: [] }), {
              headers: { 'content-type': 'application/json' },
            }),
        },
      ],
    });
    const res = await app.handler(new Request('http://localhost/users'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [] });
  });

  it('returns 404 for unmatched route', async () => {
    const app = createApp({
      _entityRoutes: [{ method: 'GET', path: '/users', handler: async () => new Response('[]') }],
    });
    const res = await app.handler(new Request('http://localhost/unknown'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NotFound');
  });

  it('passes parsed params to route handler via ctx', async () => {
    const app = createApp({
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users/:id',
          handler: async (ctx) => {
            return new Response(JSON.stringify({ id: ctx.params.id }), {
              headers: { 'content-type': 'application/json' },
            });
          },
        },
      ],
    });
    const res = await app.handler(new Request('http://localhost/users/42'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '42' });
  });

  it('parses request body for POST routes', async () => {
    const app = createApp({
      _entityRoutes: [
        {
          method: 'POST',
          path: '/users',
          handler: async (ctx) => {
            const body = ctx.body as Record<string, unknown>;
            return new Response(JSON.stringify({ created: body.name }), {
              headers: { 'content-type': 'application/json' },
            });
          },
        },
      ],
    });
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
    const app = createApp({
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users/:id',
          handler: async () => {
            throw new NotFoundException('User not found');
          },
        },
      ],
    });
    const res = await app.handler(new Request('http://localhost/users/42'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe('User not found');
    expect(body.error.code).toBe('NotFound');
  });

  it('handles unexpected errors with 500', async () => {
    const app = createApp({
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          handler: async () => {
            throw new Error('unexpected');
          },
        },
      ],
    });
    const res = await app.handler(new Request('http://localhost/users'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('InternalServerError');
  });

  it('returns 405 with Allow header for wrong HTTP method', async () => {
    const app = createApp({
      _entityRoutes: [{ method: 'GET', path: '/users', handler: async () => new Response('[]') }],
    });
    const res = await app.handler(new Request('http://localhost/users', { method: 'DELETE' }));

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('routes requests to correct handlers across multiple routes', async () => {
    const app = createApp({
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          handler: async () =>
            new Response(JSON.stringify({ type: 'users' }), {
              headers: { 'content-type': 'application/json' },
            }),
        },
        {
          method: 'GET',
          path: '/orders',
          handler: async () =>
            new Response(JSON.stringify({ type: 'orders' }), {
              headers: { 'content-type': 'application/json' },
            }),
        },
      ],
    });

    const usersRes = await app.handler(new Request('http://localhost/users'));
    expect(await usersRes.json()).toEqual({ type: 'users' });

    const ordersRes = await app.handler(new Request('http://localhost/orders'));
    expect(await ordersRes.json()).toEqual({ type: 'orders' });
  });

  it('handles CORS preflight with 204', async () => {
    const app = createApp({
      cors: { origins: true },
      _entityRoutes: [{ method: 'GET', path: '/users', handler: async () => new Response('[]') }],
    });
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

    const app = createApp({
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          handler: async (ctx) => {
            const user = ctx.user as Record<string, string>;
            return new Response(JSON.stringify({ userId: user.id }), {
              headers: { 'content-type': 'application/json' },
            });
          },
        },
      ],
    }).middlewares([authMiddleware]);
    const res = await app.handler(new Request('http://localhost/users'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: '1' });
  });

  it('returns 204 when handler returns undefined', async () => {
    const app = createApp({
      _entityRoutes: [
        {
          method: 'POST',
          path: '/users/:id/activate',
          handler: async () => undefined as unknown as Response,
        },
      ],
    });
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

    const app = createApp({
      _entityRoutes: [{ method: 'GET', path: '/users', handler: async () => new Response('[]') }],
    }).middlewares([authMiddleware]);
    const res = await app.handler(new Request('http://localhost/users'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('Invalid token');
  });

  it('prepends basePath to all routes', async () => {
    const app = createApp({
      basePath: '/api',
      _entityRoutes: [
        {
          method: 'GET',
          path: '/api/users',
          handler: async () =>
            new Response(JSON.stringify({ users: [] }), {
              headers: { 'content-type': 'application/json' },
            }),
        },
      ],
    });

    const res = await app.handler(new Request('http://localhost/api/users'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [] });

    const miss = await app.handler(new Request('http://localhost/users'));
    expect(miss.status).toBe(404);
  });

  it('provides immutable ctx in development mode', async () => {
    process.env.NODE_ENV = 'development';

    let mutationThrew = false;
    const app = createApp({
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          handler: async (ctx) => {
            try {
              (ctx as Record<string, unknown>).params = 'mutated';
            } catch {
              mutationThrew = true;
            }
            return new Response(JSON.stringify({ ok: true }), {
              headers: { 'content-type': 'application/json' },
            });
          },
        },
      ],
    });
    await app.handler(new Request('http://localhost/users'));

    expect(mutationThrew).toBe(true);
  });

  it('applies CORS headers to actual responses', async () => {
    const app = createApp({
      cors: { origins: true },
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          handler: async () =>
            new Response(JSON.stringify({ users: [] }), {
              headers: { 'content-type': 'application/json' },
            }),
        },
      ],
    });
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
      const app = createApp({
        _entityRoutes: [{ method: 'GET', path: '/users', handler: async () => new Response('[]') }],
      });
      const first = app.handler;
      const second = app.handler;

      expect(first).toBe(second);
    });
  });

  describe('router.routes inspection', () => {
    it('returns an empty routes array when no routes are registered', () => {
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
