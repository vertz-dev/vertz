import { describe, expect, it } from 'bun:test';
import { UnauthorizedException } from '../../exceptions';
import { createMiddleware } from '../../middleware/middleware-def';
import { createModule } from '../../module/module';
import { createModuleDef } from '../../module/module-def';
import { createApp } from '../app-builder';

describe('route-level middleware', () => {
  it('runs route-level middlewares and provides their contributions to the handler', async () => {
    const routeAuth = createMiddleware({
      name: 'route-auth',
      handler: () => ({ role: 'admin' }),
    });

    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });
    router.get('/', {
      middlewares: [routeAuth],
      handler: (ctx) => ({ role: (ctx as Record<string, unknown>).role }),
    });

    const mod = createModule(moduleDef, {
      services: [],
      routers: [router],
      exports: [],
    });

    const app = createApp({}).register(mod);
    const res = await app.handler(new Request('http://localhost/users'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: 'admin' });
  });

  it('runs route-level middlewares after global middlewares', async () => {
    const order: string[] = [];

    const globalMw = createMiddleware({
      name: 'global',
      handler: () => {
        order.push('global');
        return { fromGlobal: true };
      },
    });

    const routeMw = createMiddleware({
      name: 'route',
      handler: () => {
        order.push('route');
        return { fromRoute: true };
      },
    });

    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/items' });
    router.get('/', {
      middlewares: [routeMw],
      handler: (ctx) => ({
        fromGlobal: (ctx as Record<string, unknown>).fromGlobal,
        fromRoute: (ctx as Record<string, unknown>).fromRoute,
      }),
    });

    const mod = createModule(moduleDef, {
      services: [],
      routers: [router],
      exports: [],
    });

    const app = createApp({}).middlewares([globalMw]).register(mod);
    const res = await app.handler(new Request('http://localhost/items'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fromGlobal: true, fromRoute: true });
    expect(order).toEqual(['global', 'route']);
  });

  it('short-circuits when route-level middleware throws', async () => {
    const guardMw = createMiddleware({
      name: 'guard',
      handler: () => {
        throw new UnauthorizedException('Forbidden');
      },
    });

    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/admin' });
    router.get('/', {
      middlewares: [guardMw],
      handler: () => ({ secret: true }),
    });

    const mod = createModule(moduleDef, {
      services: [],
      routers: [router],
      exports: [],
    });

    const app = createApp({}).register(mod);
    const res = await app.handler(new Request('http://localhost/admin'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('Forbidden');
  });

  it('does not run route-level middlewares for routes without them', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/public' });
    router.get('/', {
      handler: () => ({ public: true }),
    });

    const mod = createModule(moduleDef, {
      services: [],
      routers: [router],
      exports: [],
    });

    const app = createApp({}).register(mod);
    const res = await app.handler(new Request('http://localhost/public'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ public: true });
  });
});
