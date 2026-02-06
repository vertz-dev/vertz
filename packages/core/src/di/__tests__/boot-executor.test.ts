import { describe, it, expect } from 'vitest';
import { BootExecutor } from '../boot-executor';
import type { BootSequence } from '../../types/boot-sequence';

describe('BootExecutor', () => {
  it('executes a service and returns its methods in the service map', async () => {
    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'core.greeter',
          deps: [],
          factory: {
            methods: () => ({
              greet: (name: string) => `Hello, ${name}!`,
            }),
          },
        },
      ],
      shutdownOrder: ['core.greeter'],
    };

    const executor = new BootExecutor();
    const serviceMap = await executor.execute(sequence);

    const greeter = serviceMap.get('core.greeter') as { greet: (name: string) => string };
    expect(greeter.greet('World')).toBe('Hello, World!');
  });

  it('resolves linear dependency chain', async () => {
    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'db',
          deps: [],
          factory: {
            methods: () => ({
              query: (sql: string) => `result of ${sql}`,
            }),
          },
        },
        {
          type: 'service',
          id: 'userService',
          deps: ['db'],
          factory: {
            methods: (deps: any) => ({
              findById: (id: string) => deps.db.query(`SELECT * FROM users WHERE id = '${id}'`),
            }),
          },
        },
      ],
      shutdownOrder: ['userService', 'db'],
    };

    const executor = new BootExecutor();
    const serviceMap = await executor.execute(sequence);

    const userService = serviceMap.get('userService') as { findById: (id: string) => string };
    expect(userService.findById('123')).toBe("result of SELECT * FROM users WHERE id = '123'");
  });

  it('resolves diamond dependency (shared dependency instantiated once)', async () => {
    let configCallCount = 0;

    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'config',
          deps: [],
          factory: {
            methods: () => {
              configCallCount++;
              return { dbUrl: 'postgres://localhost' };
            },
          },
        },
        {
          type: 'service',
          id: 'cache',
          deps: ['config'],
          factory: {
            methods: (deps: any) => ({ get: () => deps.config.dbUrl }),
          },
        },
        {
          type: 'service',
          id: 'db',
          deps: ['config'],
          factory: {
            methods: (deps: any) => ({ connect: () => deps.config.dbUrl }),
          },
        },
        {
          type: 'service',
          id: 'app',
          deps: ['cache', 'db'],
          factory: {
            methods: (deps: any) => ({
              status: () => `cache: ${deps.cache.get()}, db: ${deps.db.connect()}`,
            }),
          },
        },
      ],
      shutdownOrder: ['app', 'db', 'cache', 'config'],
    };

    const executor = new BootExecutor();
    const serviceMap = await executor.execute(sequence);

    const app = serviceMap.get('app') as { status: () => string };
    expect(app.status()).toBe('cache: postgres://localhost, db: postgres://localhost');
    expect(configCallCount).toBe(1);
  });

  it('runs onInit and passes state to methods', async () => {
    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'db',
          deps: [],
          factory: {
            onInit: async () => ({ client: 'connected-client' }),
            methods: (_deps: any, state: any) => ({
              getClient: () => state.client,
            }),
          },
        },
      ],
      shutdownOrder: ['db'],
    };

    const executor = new BootExecutor();
    const serviceMap = await executor.execute(sequence);

    const db = serviceMap.get('db') as { getClient: () => string };
    expect(db.getClient()).toBe('connected-client');
  });

  it('calls onDestroy in shutdown order', async () => {
    const destroyOrder: string[] = [];

    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'db',
          deps: [],
          factory: {
            onInit: async () => ({ name: 'db' }),
            methods: () => ({}),
            onDestroy: async (_deps: any, state: any) => {
              destroyOrder.push(state.name);
            },
          },
        },
        {
          type: 'service',
          id: 'cache',
          deps: [],
          factory: {
            onInit: async () => ({ name: 'cache' }),
            methods: () => ({}),
            onDestroy: async (_deps: any, state: any) => {
              destroyOrder.push(state.name);
            },
          },
        },
      ],
      shutdownOrder: ['cache', 'db'],
    };

    const executor = new BootExecutor();
    await executor.execute(sequence);
    await executor.shutdown();

    expect(destroyOrder).toEqual(['cache', 'db']);
  });

  it('clears instances after shutdown', async () => {
    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'svc',
          deps: [],
          factory: { methods: () => ({ value: 42 }) },
        },
      ],
      shutdownOrder: ['svc'],
    };

    const executor = new BootExecutor();
    const serviceMap = await executor.execute(sequence);
    expect(serviceMap.get('svc')).toBeDefined();

    await executor.shutdown();

    // After shutdown, re-executing should start fresh
    const freshMap = await executor.execute(sequence);
    expect(freshMap.get('svc')).toBeDefined();
  });

  it('throws when a dependency is not found', async () => {
    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'userService',
          deps: ['nonexistent'],
          factory: { methods: () => ({}) },
        },
      ],
      shutdownOrder: [],
    };

    const executor = new BootExecutor();
    await expect(executor.execute(sequence)).rejects.toThrow('Dependency "nonexistent" not found');
  });

  it('skips module instructions without error', async () => {
    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'svc',
          deps: [],
          factory: { methods: () => ({ value: 1 }) },
        },
        {
          type: 'module',
          id: 'core',
          services: ['svc'],
        },
      ],
      shutdownOrder: ['svc'],
    };

    const executor = new BootExecutor();
    const serviceMap = await executor.execute(sequence);

    expect(serviceMap.get('svc')).toBeDefined();
  });
});
