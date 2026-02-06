import { describe, it, expect } from 'vitest';
import { createTestApp } from '../test-app';
import { createModuleDef, createModule } from '@vertz/core/src/module';
import type { NamedRouterDef } from '@vertz/core/src/module';
import { createMiddleware } from '@vertz/core/src/middleware/middleware-def';
import type { NamedServiceDef } from '@vertz/core/src/module/service';
import type { NamedModule } from '@vertz/core/src/module/module';

interface RouteInput {
  method: string;
  path: string;
  handler: (ctx: any) => any;
}

function addRoutes(router: NamedRouterDef, routes: RouteInput[]): void {
  for (const route of routes) {
    const method = route.method.toLowerCase() as 'get' | 'post';
    router[method](route.path, { handler: route.handler });
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
  it('returns a builder with register, mock, mockMiddleware, get, post', () => {
    const app = createTestApp();

    expect(app.register).toBeTypeOf('function');
    expect(app.mock).toBeTypeOf('function');
    expect(app.mockMiddleware).toBeTypeOf('function');
    expect(app.get).toBeTypeOf('function');
    expect(app.post).toBeTypeOf('function');
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

    const app = createTestApp()
      .env({ DATABASE_URL: 'postgres://test' })
      .register(mod);

    const res = await app.get('/api');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ dbUrl: 'postgres://test' });
  });

  it('uses mocked middleware result instead of running real middleware', async () => {
    const authMiddleware = createMiddleware({
      name: 'auth',
      handler: () => { throw new Error('should not run'); },
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
      handler: () => { throw new Error('should not run'); },
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
      { method: 'GET', path: '/', handler: (ctx: any) => ({ token: ctx.headers['authorization'] }) },
    ]);

    const app = createTestApp().register(mod);
    const res = await app.get('/api', { headers: { authorization: 'Bearer test-token' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: 'Bearer test-token' });
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
});
