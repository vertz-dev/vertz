import { describe, it, expect } from 'vitest';
import { createModuleDef } from '../module-def';
import { createModule } from '../module';

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
});
