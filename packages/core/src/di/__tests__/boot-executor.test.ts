import { afterEach, describe, expect, it } from 'vitest';
import type { BootSequence } from '../../types/boot-sequence';
import { BootExecutor } from '../boot-executor';

describe('BootExecutor', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('executes a service and returns its methods in the service map', async () => {
    const greeterMethods = {
      greet: (name: string) => `Hello, ${name}!`,
    };

    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'core.greeter',
          deps: [],
          factory: { methods: () => greeterMethods },
        },
      ],
      shutdownOrder: ['core.greeter'],
    };

    const executor = new BootExecutor();
    const serviceMap = await executor.execute(sequence);

    const greeter = serviceMap.get('core.greeter') as typeof greeterMethods;
    expect(greeter.greet('World')).toBe('Hello, World!');
  });

  it('resolves linear dependency chain', async () => {
    const dbMethods = {
      query: (sql: string) => `result of ${sql}`,
    };

    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'db',
          deps: [],
          factory: { methods: () => dbMethods },
        },
        {
          type: 'service',
          id: 'userService',
          deps: ['db'],
          factory: {
            methods: (deps) => {
              const { db } = deps as { db: typeof dbMethods };
              return {
                findById: (id: string) => db.query(`SELECT * FROM users WHERE id = '${id}'`),
              };
            },
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

    const configMethods = () => {
      configCallCount++;
      return { dbUrl: 'postgres://localhost' };
    };
    type Config = ReturnType<typeof configMethods>;

    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'config',
          deps: [],
          factory: { methods: configMethods },
        },
        {
          type: 'service',
          id: 'cache',
          deps: ['config'],
          factory: {
            methods: (deps) => {
              const { config } = deps as { config: Config };
              return { get: () => config.dbUrl };
            },
          },
        },
        {
          type: 'service',
          id: 'db',
          deps: ['config'],
          factory: {
            methods: (deps) => {
              const { config } = deps as { config: Config };
              return { connect: () => config.dbUrl };
            },
          },
        },
        {
          type: 'service',
          id: 'app',
          deps: ['cache', 'db'],
          factory: {
            methods: (deps) => {
              const d = deps as {
                cache: { get: () => string };
                db: { connect: () => string };
              };
              return { status: () => `cache: ${d.cache.get()}, db: ${d.db.connect()}` };
            },
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
    const dbMethods = (_deps: unknown, state: unknown) => ({
      getClient: () => (state as { client: string }).client,
    });

    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'db',
          deps: [],
          factory: {
            onInit: async () => ({ client: 'connected-client' }),
            methods: dbMethods,
          },
        },
      ],
      shutdownOrder: ['db'],
    };

    const executor = new BootExecutor();
    const serviceMap = await executor.execute(sequence);

    const db = serviceMap.get('db') as ReturnType<typeof dbMethods>;
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
            onDestroy: async (_deps, state) => {
              destroyOrder.push((state as { name: string }).name);
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
            onDestroy: async (_deps, state) => {
              destroyOrder.push((state as { name: string }).name);
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

  it('wraps deps with makeImmutable before passing to methods', async () => {
    process.env.NODE_ENV = 'development';
    let receivedDeps: Record<string, unknown>;

    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'config',
          deps: [],
          factory: { methods: () => ({ url: 'postgres://localhost' }) },
        },
        {
          type: 'service',
          id: 'db',
          deps: ['config'],
          factory: {
            methods: (deps) => {
              receivedDeps = deps as Record<string, unknown>;
              return {};
            },
          },
        },
      ],
      shutdownOrder: [],
    };

    const executor = new BootExecutor();
    await executor.execute(sequence);

    expect(() => {
      receivedDeps.config = 'mutated';
    }).toThrow();
  });

  it('throws on invalid options', async () => {
    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'svc',
          deps: [],
          factory: {
            options: {
              safeParse: (value: unknown) => {
                if (typeof value === 'object' && value !== null && 'port' in value) {
                  return { success: true as const, data: value };
                }
                return {
                  success: false as const,
                  error: { issues: [{ message: 'port is required' }] },
                };
              },
            } as unknown,
            methods: () => ({}),
          },
          options: { timeout: 300 }, // invalid - missing required 'port'
        },
      ],
      shutdownOrder: ['svc'],
    };

    const executor = new BootExecutor();
    await expect(executor.execute(sequence)).rejects.toThrow('Invalid options for service svc');
  });

  it('throws on invalid env', async () => {
    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'svc',
          deps: [],
          factory: {
            env: {
              safeParse: (value: unknown) => {
                if (typeof value === 'object' && value !== null && 'DATABASE_URL' in value) {
                  return { success: true as const, data: value };
                }
                return {
                  success: false as const,
                  error: { issues: [{ message: 'DATABASE_URL is required' }] },
                };
              },
            } as unknown,
            methods: () => ({}),
          },
          env: { REDIS_URL: 'redis://localhost' }, // invalid - missing required 'DATABASE_URL'
        },
      ],
      shutdownOrder: ['svc'],
    };

    const executor = new BootExecutor();
    await expect(executor.execute(sequence)).rejects.toThrow('Invalid env for service svc');
  });

  it('passes options to onInit and methods', async () => {
    let receivedOptions: Record<string, unknown> = {};
    let receivedEnv: Record<string, unknown> = {};

    const sequence: BootSequence = {
      instructions: [
        {
          type: 'service',
          id: 'svc',
          deps: [],
          factory: {
            options: {
              safeParse: (value: unknown) => ({
                success: true as const,
                data: value ?? { maxRetries: 3 },
              }),
            } as unknown,
            env: {
              safeParse: (value: unknown) => ({
                success: true as const,
                data: value ?? { NODE_ENV: 'development' },
              }),
            } as unknown,
            onInit: async (_deps, opts, env) => {
              receivedOptions = opts;
              receivedEnv = env;
              return { initialized: true };
            },
            methods: (_deps, state, opts, env) => {
              receivedOptions = opts;
              receivedEnv = env;
              return { getOptions: () => opts, getEnv: () => env, state };
            },
          },
          options: { maxRetries: 5 },
          env: { NODE_ENV: 'production' },
        },
      ],
      shutdownOrder: ['svc'],
    };

    const executor = new BootExecutor();
    const serviceMap = await executor.execute(sequence);

    expect(receivedOptions).toEqual({ maxRetries: 5 });
    expect(receivedEnv).toEqual({ NODE_ENV: 'production' });

    const svc = serviceMap.get('svc') as {
      getOptions: () => Record<string, unknown>;
      getEnv: () => Record<string, unknown>;
    };
    expect(svc.getOptions()).toEqual({ maxRetries: 5 });
    expect(svc.getEnv()).toEqual({ NODE_ENV: 'production' });
  });
});
