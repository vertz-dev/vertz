import {
  createMiddleware,
  createModuleDef,
  createModule,
  type NamedModule,
  type NamedServiceDef,
  type NamedRouterDef,
} from '@vertz/core';
import { s } from '@vertz/schema';
import { describe, it, expect } from 'vitest';

import { createTestApp } from '../test-app';

interface RouteInput {
  method: string;
  path: string;
  handler: (ctx: any) => any;
  response?: any;
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
  serviceDef: { methods: (deps: any, state: any) => any },
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
      { method: 'POST', path: '/', handler: (ctx: any) => ({ created: ctx.body.name }) },
    ]);

    const app = createTestApp().register(mod);
    const res = await app.post('/users', { body: { name: 'Alice' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: 'Alice' });
  });

  it('passes route params to handler via ctx', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'GET', path: '/:id', handler: (ctx: any) => ({ userId: ctx.params.id }) },
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
      { method: 'GET', path: '/', handler: (ctx: any) => ({ dbUrl: ctx.env.DATABASE_URL }) },
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
      { method: 'GET', path: '/', handler: (ctx: any) => ({ user: ctx.user }) },
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
      { method: 'GET', path: '/', handler: (ctx: any) => ({ role: ctx.user.role }) },
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
        handler: (ctx: any) => ({ token: ctx.headers['authorization'] }),
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
        handler: (ctx: any) => ({ updated: ctx.params.id, name: ctx.body.name }),
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
        handler: (ctx: any) => ({ patched: ctx.params.id, email: ctx.body.email }),
      },
    ]);

    const app = createTestApp().register(mod);
    const res = await app.patch('/users/42', { body: { email: 'new@test.com' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ patched: '42', email: 'new@test.com' });
  });

  it('executes a DELETE request', async () => {
    const mod = createTestModule('test', '/users', [
      { method: 'DELETE', path: '/:id', handler: (ctx: any) => ({ deleted: ctx.params.id }) },
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
      [{ method: 'GET', path: '/', handler: (ctx: any) => ({ message: ctx.svc.greet() }) }],
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
      [{ method: 'GET', path: '/', handler: (ctx: any) => ({ message: ctx.svc.greet() }) }],
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
      [{ method: 'GET', path: '/', handler: (ctx: any) => ({ message: ctx.svc.greet() }) }],
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

    await expect(app.get('/api')).rejects.toThrow('Response validation failed');
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

    await expect(app.get('/api')).rejects.toThrow('Response validation failed');
  });
});
