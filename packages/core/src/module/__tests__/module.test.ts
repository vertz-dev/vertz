import { describe, expect, it } from 'bun:test';
import { createModule } from '../module';
import { createModuleDef } from '../module-def';

describe('createModule', () => {
  it('assembles module with definition, services, and routers', () => {
    const moduleDef = createModuleDef({ name: 'user' });
    const service = moduleDef.service({
      methods: () => ({ find: () => {} }),
    });
    const router = moduleDef.router({ prefix: '/users' });
    router.get('/', { handler: () => {} });

    const mod = createModule(moduleDef, {
      services: [service],
      routers: [router],
      exports: [service],
    });

    expect(mod.definition).toBe(moduleDef);
    expect(mod.services).toEqual([service]);
    expect(mod.routers).toEqual([router]);
    expect(mod.exports).toEqual([service]);
  });

  it('throws if exports contains a service not in services', () => {
    const moduleDef = createModuleDef({ name: 'user' });
    const service = moduleDef.service({
      methods: () => ({ find: () => {} }),
    });
    const otherService = moduleDef.service({
      methods: () => ({ other: () => {} }),
    });

    expect(() =>
      createModule(moduleDef, {
        services: [service],
        routers: [],
        exports: [otherService],
      }),
    ).toThrow('exports must be a subset of services');
  });

  it('returns a frozen module', () => {
    const moduleDef = createModuleDef({ name: 'user' });
    const service = moduleDef.service({
      methods: () => ({ find: () => {} }),
    });

    const mod = createModule(moduleDef, {
      services: [service],
      routers: [],
      exports: [],
    });

    expect(Object.isFrozen(mod)).toBe(true);
  });

  it('allows empty exports', () => {
    const moduleDef = createModuleDef({ name: 'internal' });
    const service = moduleDef.service({
      methods: () => ({ process: () => {} }),
    });

    const mod = createModule(moduleDef, {
      services: [service],
      routers: [],
      exports: [],
    });

    expect(mod.exports).toEqual([]);
  });

  it('freezes routers inside the module (no further route registration)', () => {
    const moduleDef = createModuleDef({ name: 'user' });
    const router = moduleDef.router({ prefix: '/users' });
    router.get('/', { handler: () => {} });

    const mod = createModule(moduleDef, {
      services: [],
      routers: [router],
      exports: [],
    });

    expect(Object.isFrozen(mod.routers[0])).toBe(true);
  });

  it('throws if a service belongs to a different module', () => {
    const userDef = createModuleDef({ name: 'user' });
    const productDef = createModuleDef({ name: 'product' });

    const productService = productDef.service({
      methods: () => ({ find: () => {} }),
    });

    expect(() =>
      createModule(userDef, {
        services: [productService],
        routers: [],
        exports: [],
      }),
    ).toThrow('module "product"');
  });

  it('throws if a router belongs to a different module', () => {
    const userDef = createModuleDef({ name: 'user' });
    const productDef = createModuleDef({ name: 'product' });

    const productRouter = productDef.router({ prefix: '/products' });

    expect(() =>
      createModule(userDef, {
        services: [],
        routers: [productRouter],
        exports: [],
      }),
    ).toThrow('module "product"');
  });
});
