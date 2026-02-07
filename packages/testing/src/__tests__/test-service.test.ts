import { createModuleDef } from '@vertz/core';
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
});
