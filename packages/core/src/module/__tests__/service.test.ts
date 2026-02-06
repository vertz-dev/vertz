import { describe, it, expect } from 'vitest';
import { createModuleDef } from '../module-def';

describe('moduleDef.service', () => {
  it('creates a service def with methods', () => {
    const moduleDef = createModuleDef({ name: 'user' });

    const service = moduleDef.service({
      methods: (deps: any) => ({
        findById: (id: string) => ({ id }),
      }),
    });

    expect(service.methods).toBeTypeOf('function');
    expect(service.moduleName).toBe('user');
  });

  it('captures inject map and lifecycle hooks', () => {
    const moduleDef = createModuleDef({ name: 'core' });
    const mockDb = { query: () => {} };
    const onInit = async () => ({ client: 'connected' });
    const onDestroy = async () => {};

    const service = moduleDef.service({
      inject: { db: mockDb },
      onInit,
      methods: (_deps: any, state: any) => ({
        getClient: () => state.client,
      }),
      onDestroy,
    });

    expect(service.inject).toEqual({ db: mockDb });
    expect(service.onInit).toBe(onInit);
    expect(service.onDestroy).toBe(onDestroy);
  });

  it('returns a frozen service def', () => {
    const moduleDef = createModuleDef({ name: 'user' });

    const service = moduleDef.service({
      methods: () => ({ find: () => {} }),
    });

    expect(Object.isFrozen(service)).toBe(true);
  });
});
