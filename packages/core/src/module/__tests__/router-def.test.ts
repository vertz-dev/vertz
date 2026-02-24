import { describe, expect, it } from 'bun:test';
import type { HandlerCtx } from '../../types/context';
import { createModuleDef } from '../module-def';
import { createRouterDef } from '../router-def';

describe('moduleDef.router', () => {
  it('creates a router with prefix and inject', () => {
    const moduleDef = createModuleDef({ name: 'user' });
    const mockService = { findById: () => {} };

    const router = moduleDef.router({
      prefix: '/users',
      inject: { userService: mockService },
    });

    expect(router.prefix).toBe('/users');
    expect(router.inject).toEqual({ userService: mockService });
    expect(router.moduleName).toBe('user');
  });

  it('registers GET route with handler', () => {
    const moduleDef = createModuleDef({ name: 'user' });
    const router = moduleDef.router({ prefix: '/users' });
    const handler = (ctx: HandlerCtx) => ({ id: ctx.params.id });

    router.get('/:id', { handler });

    expect(router.routes).toHaveLength(1);
    expect(router.routes[0]).toEqual({
      method: 'GET',
      path: '/:id',
      config: { handler },
    });
  });

  it('registers POST route with body and response schemas', () => {
    const moduleDef = createModuleDef({ name: 'user' });
    const router = moduleDef.router({ prefix: '/users' });
    const bodySchema = { parse: () => {} };
    const responseSchema = { parse: () => {} };
    const handler = (ctx: HandlerCtx) => ctx.body;

    router.post('/', {
      body: bodySchema,
      response: responseSchema,
      handler,
    });

    expect(router.routes[0].method).toBe('POST');
    expect(router.routes[0].config.body).toBe(bodySchema);
    expect(router.routes[0].config.response).toBe(responseSchema);
  });

  it('supports all HTTP methods', () => {
    const moduleDef = createModuleDef({ name: 'user' });
    const router = moduleDef.router({ prefix: '/users' });
    const handler = () => {};

    router
      .get('/', { handler })
      .post('/', { handler })
      .put('/:id', { handler })
      .patch('/:id', { handler })
      .delete('/:id', { handler })
      .head('/:id', { handler });

    expect(router.routes).toHaveLength(6);
    expect(router.routes.map((r) => r.method)).toEqual([
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
    ]);
  });

  it('captures full route config with params, query, headers, and middlewares', () => {
    const moduleDef = createModuleDef({ name: 'user' });
    const router = moduleDef.router({ prefix: '/users' });
    const paramsSchema = { parse: () => {} };
    const querySchema = { parse: () => {} };
    const headersSchema = { parse: () => {} };
    const mockMiddleware = { name: 'auth', handler: () => {} };
    const handler = () => {};

    router.get('/:id', {
      params: paramsSchema,
      query: querySchema,
      headers: headersSchema,
      middlewares: [mockMiddleware],
      handler,
    });

    const route = router.routes[0];
    expect(route.config.params).toBe(paramsSchema);
    expect(route.config.query).toBe(querySchema);
    expect(route.config.headers).toBe(headersSchema);
    expect(route.config.middlewares).toEqual([mockMiddleware]);
  });

  it('returns itself for chaining', () => {
    const moduleDef = createModuleDef({ name: 'user' });
    const router = moduleDef.router({ prefix: '/users' });

    const result = router.get('/', { handler: () => {} });

    expect(result).toBe(router);
  });

  it('throws when path does not start with /', () => {
    const router = createRouterDef('user', { prefix: '/users' });

    expect(() => {
      (router.get as (path: string, config: unknown) => unknown)(':id', { handler: () => {} });
    }).toThrow("Route path must start with '/', got ':id'");
  });

  it('throws for path without leading / on any HTTP method', () => {
    const router = createRouterDef('user', { prefix: '/users' });

    expect(() => {
      (router.post as (path: string, config: unknown) => unknown)('create', { handler: () => {} });
    }).toThrow("Route path must start with '/', got 'create'");
  });

  it('accepts valid paths starting with /', () => {
    const router = createRouterDef('user', { prefix: '/users' });

    expect(() => {
      router.get('/', { handler: () => {} });
      router.get('/:id', { handler: () => {} });
      router.post('/nested/:param/path', { handler: () => {} });
    }).not.toThrow();
  });
});
