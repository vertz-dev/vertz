import { s } from '@vertz/schema';
import { createModuleDef } from '@vertz/server';
import { describe, expect, it } from 'vitest';

import { createTestService } from '../test-service';

describe('createTestService', () => {
  it('builds a service and returns its methods', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const service = moduleDef.service({
      methods: () => ({
        greet: (name: string) => `hello ${name}`,
      }),
    });

    const methods = await createTestService(service);

    expect(methods.greet('world')).toBe('hello world');
  });

  it('injects mocked dependencies', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const dbService = moduleDef.service({
      methods: () => ({ query: (sql: string) => sql }),
    });
    const dbMethods = { query: (sql: string) => sql };
    const userService = moduleDef.service({
      inject: { db: dbService },
      methods: (deps) => {
        const { db } = deps as { db: typeof dbMethods };
        return {
          findById: (id: string) => db.query(`SELECT * FROM users WHERE id = '${id}'`),
        };
      },
    });

    const methods = await createTestService(userService).mock(dbService, {
      query: (sql: string) => `mocked: ${sql}`,
    });

    expect(methods.findById('42')).toBe("mocked: SELECT * FROM users WHERE id = '42'");
  });

  it('throws when an injected dependency is not mocked', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const dbService = moduleDef.service({
      methods: () => ({ query: (sql: string) => sql }),
    });
    const userService = moduleDef.service({
      inject: { db: dbService },
      methods: (deps) => {
        const { db } = deps as { db: { query: (sql: string) => string } };
        return {
          findById: (id: string) => db.query(`SELECT * FROM users WHERE id = '${id}'`),
        };
      },
    });

    await expect(Promise.resolve(createTestService(userService))).rejects.toThrow(
      /missing mock.*db/i,
    );
  });

  it('awaits async onInit and passes state to methods', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const service = moduleDef.service({
      onInit: async () => ({ connection: 'established' }),
      methods: (_deps, state) => {
        const { connection } = state as { connection: string };
        return {
          getConnection: () => connection,
        };
      },
    });

    const methods = await createTestService(service);

    expect(methods.getConnection()).toBe('established');
  });

  it('passes options to methods', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const service = moduleDef.service({
      options: s.object({
        maxLoginAttempts: s.number().default(5),
      }),
      methods: (_deps, _state, opts) => {
        return {
          getMaxAttempts: () => opts.maxLoginAttempts,
        };
      },
    });

    const methods = await createTestService(service).options({ maxLoginAttempts: 3 });

    expect(methods.getMaxAttempts()).toBe(3);
  });

  it('uses default options when not provided', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const service = moduleDef.service({
      options: s.object({
        maxLoginAttempts: s.number().default(5),
      }),
      methods: (_deps, _state, opts) => {
        return {
          getMaxAttempts: () => opts.maxLoginAttempts,
        };
      },
    });

    const methods = await createTestService(service);

    expect(methods.getMaxAttempts()).toBe(5);
  });

  it('passes env overrides to methods', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const service = moduleDef.service({
      env: s.object({
        JWT_SECRET: s.string(),
        AUTH_PROVIDER: s.string().optional(),
      }),
      methods: (_deps, _state, _opts, env) => {
        return {
          getSecret: () => env.JWT_SECRET,
          getProvider: () => env.AUTH_PROVIDER ?? 'default',
        };
      },
    });

    const methods = await createTestService(service).env({
      JWT_SECRET: 'test-secret',
    });

    expect(methods.getSecret()).toBe('test-secret');
    expect(methods.getProvider()).toBe('default');
  });

  it('passes both options and env to methods', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const service = moduleDef.service({
      options: s.object({
        maxLoginAttempts: s.number().default(5),
      }),
      env: s.object({
        JWT_SECRET: s.string(),
      }),
      methods: (_deps, _state, opts, env) => {
        return {
          getMaxAttempts: () => opts.maxLoginAttempts,
          getSecret: () => env.JWT_SECRET,
        };
      },
    });

    const methods = await createTestService(service)
      .options({ maxLoginAttempts: 10 })
      .env({ JWT_SECRET: 'my-secret' });

    expect(methods.getMaxAttempts()).toBe(10);
    expect(methods.getSecret()).toBe('my-secret');
  });

  it('combines mocks, options, and env', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const dbService = moduleDef.service({
      methods: () => ({ query: (sql: string) => sql }),
    });
    const service = moduleDef.service({
      inject: { db: dbService },
      options: s.object({
        maxLoginAttempts: s.number().default(5),
      }),
      env: s.object({
        JWT_SECRET: s.string(),
      }),
      methods: (deps, _state, opts, env) => {
        const { db } = deps as { db: { query: (sql: string) => string } };
        return {
          login: (username: string) => ({
            attempts: opts.maxLoginAttempts,
            secret: env.JWT_SECRET,
            query: db.query(`SELECT * FROM users WHERE name = '${username}'`),
          }),
        };
      },
    });

    const methods = await createTestService(service)
      .mock(dbService, { query: (sql: string) => `mocked: ${sql}` })
      .options({ maxLoginAttempts: 3 })
      .env({ JWT_SECRET: 'test-secret' });

    const result = methods.login('john');
    expect(result.attempts).toBe(3);
    expect(result.secret).toBe('test-secret');
    expect(result.query).toBe("mocked: SELECT * FROM users WHERE name = 'john'");
  });
});
