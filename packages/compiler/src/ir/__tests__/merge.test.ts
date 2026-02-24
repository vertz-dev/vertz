import { describe, expect, it } from 'bun:test';
import { createEmptyAppIR, enrichSchemasWithModuleNames } from '../builder';
import { mergeIR } from '../merge';
import type { AppIR, DependencyGraphIR, MiddlewareIR, ModuleIR, SchemaIR } from '../types';

function createMinimalIR(overrides?: Partial<AppIR>): AppIR {
  return {
    ...createEmptyAppIR(),
    app: {
      basePath: '/api',
      globalMiddleware: [],
      moduleRegistrations: [],
      sourceFile: 'src/app.ts',
      sourceLine: 1,
      sourceColumn: 1,
    },
    ...overrides,
  };
}

function makeModule(name: string): ModuleIR {
  return {
    name,
    imports: [],
    services: [],
    routers: [],
    exports: [],
    sourceFile: `src/modules/${name}/${name}.module.ts`,
    sourceLine: 1,
    sourceColumn: 1,
  };
}

describe('mergeIR', () => {
  it('preserves unaffected modules', () => {
    const base = createMinimalIR({
      modules: [makeModule('user'), makeModule('order')],
    });
    const partial: Partial<AppIR> = { modules: [makeModule('user')] };

    const merged = mergeIR(base, partial);

    const order = merged.modules.find((m) => m.name === 'order');
    expect(order).toBeDefined();
    expect(order?.sourceFile).toBe('src/modules/order/order.module.ts');
  });

  it('replaces module by name', () => {
    const base = createMinimalIR({
      modules: [makeModule('user'), makeModule('order')],
    });
    const updatedUser = { ...makeModule('user'), exports: ['UserService'] };
    const partial: Partial<AppIR> = { modules: [updatedUser] };

    const merged = mergeIR(base, partial);

    expect(merged.modules).toHaveLength(2);
    const user = merged.modules.find((m) => m.name === 'user');
    expect(user?.exports).toEqual(['UserService']);
  });

  it('replaces schemas by name', () => {
    const schema1: SchemaIR = {
      name: 'CreateUser',
      isNamed: true,
      moduleName: '',
      namingConvention: {},
      sourceFile: 'src/schemas/user.ts',
      sourceLine: 1,
      sourceColumn: 1,
    };
    const schema2: SchemaIR = {
      name: 'ReadUser',
      isNamed: true,
      moduleName: '',
      namingConvention: {},
      sourceFile: 'src/schemas/user.ts',
      sourceLine: 5,
      sourceColumn: 1,
    };
    const base = createMinimalIR({ schemas: [schema1, schema2] });
    const updatedSchema: SchemaIR = {
      ...schema1,
      jsonSchema: { type: 'object' },
    };
    const partial: Partial<AppIR> = { schemas: [updatedSchema] };

    const merged = mergeIR(base, partial);

    expect(merged.schemas).toHaveLength(2);
    const createUser = merged.schemas.find((s) => s.name === 'CreateUser');
    expect(createUser?.jsonSchema).toEqual({ type: 'object' });
  });

  it('preserves unaffected schemas', () => {
    const schema1: SchemaIR = {
      name: 'CreateUser',
      isNamed: true,
      moduleName: '',
      namingConvention: {},
      sourceFile: 'src/schemas/user.ts',
      sourceLine: 1,
      sourceColumn: 1,
    };
    const schema2: SchemaIR = {
      name: 'ReadUser',
      isNamed: true,
      moduleName: '',
      namingConvention: {},
      sourceFile: 'src/schemas/user.ts',
      sourceLine: 5,
      sourceColumn: 1,
    };
    const base = createMinimalIR({ schemas: [schema1, schema2] });
    const partial: Partial<AppIR> = {
      schemas: [{ ...schema1, jsonSchema: { type: 'object' } }],
    };

    const merged = mergeIR(base, partial);

    const readUser = merged.schemas.find((s) => s.name === 'ReadUser');
    expect(readUser).toBeDefined();
    expect(readUser?.sourceLine).toBe(5);
  });

  it('replaces middleware by name', () => {
    const mw: MiddlewareIR = {
      name: 'auth',
      inject: [],
      sourceFile: 'src/middleware/auth.ts',
      sourceLine: 1,
      sourceColumn: 1,
    };
    const base = createMinimalIR({ middleware: [mw] });
    const updatedMw: MiddlewareIR = {
      ...mw,
      provides: {
        kind: 'inline',
        sourceFile: 'src/middleware/auth.ts',
        jsonSchema: { type: 'object' },
      },
    };
    const partial: Partial<AppIR> = { middleware: [updatedMw] };

    const merged = mergeIR(base, partial);

    expect(merged.middleware).toHaveLength(1);
    expect(merged.middleware[0].provides).toBeDefined();
  });

  it('merges with empty partial IR', () => {
    const base = createMinimalIR({
      modules: [makeModule('user')],
    });
    const merged = mergeIR(base, {});

    expect(merged.modules).toHaveLength(1);
    expect(merged.modules[0].name).toBe('user');
  });

  it('merges into empty base IR', () => {
    const base = createMinimalIR();
    const partial: Partial<AppIR> = { modules: [makeModule('user')] };

    const merged = mergeIR(base, partial);

    expect(merged.modules).toHaveLength(1);
    expect(merged.modules[0].name).toBe('user');
  });

  it('adds new modules from partial', () => {
    const base = createMinimalIR({
      modules: [makeModule('user')],
    });
    const partial: Partial<AppIR> = { modules: [makeModule('order')] };

    const merged = mergeIR(base, partial);

    expect(merged.modules).toHaveLength(2);
    expect(merged.modules.map((m) => m.name).sort()).toEqual(['order', 'user']);
  });

  it('handles full replacement when all items are in partial', () => {
    const base = createMinimalIR({
      modules: [makeModule('user'), makeModule('order')],
    });
    const partial: Partial<AppIR> = {
      modules: [
        { ...makeModule('user'), exports: ['UserService'] },
        { ...makeModule('order'), exports: ['OrderService'] },
      ],
    };

    const merged = mergeIR(base, partial);

    expect(merged.modules).toHaveLength(2);
    expect(merged.modules.find((m) => m.name === 'user')?.exports).toEqual(['UserService']);
    expect(merged.modules.find((m) => m.name === 'order')?.exports).toEqual(['OrderService']);
  });

  it('clears previous diagnostics', () => {
    const base = createMinimalIR({
      diagnostics: [{ severity: 'error', code: 'VERTZ_APP_MISSING', message: 'old' }],
    });
    const partial: Partial<AppIR> = {};

    const merged = mergeIR(base, partial);

    expect(merged.diagnostics).toEqual([]);
  });

  it('replaces dependency graph when provided in partial', () => {
    const base = createMinimalIR({
      modules: [makeModule('user')],
    });
    const newGraph: DependencyGraphIR = {
      nodes: [{ id: 'user', kind: 'module', name: 'user' }],
      edges: [],
      initializationOrder: ['user'],
      circularDependencies: [],
    };
    const partial: Partial<AppIR> = { dependencyGraph: newGraph };

    const merged = mergeIR(base, partial);

    expect(merged.dependencyGraph.nodes).toHaveLength(1);
    expect(merged.dependencyGraph.initializationOrder).toEqual(['user']);
  });

  it('preserves base dependency graph when not in partial', () => {
    const baseGraph: DependencyGraphIR = {
      nodes: [{ id: 'user', kind: 'module', name: 'user' }],
      edges: [],
      initializationOrder: ['user'],
      circularDependencies: [],
    };
    const base = createMinimalIR({
      dependencyGraph: baseGraph,
      modules: [makeModule('user')],
    });
    const partial: Partial<AppIR> = { modules: [makeModule('user')] };

    const merged = mergeIR(base, partial);

    expect(merged.dependencyGraph.initializationOrder).toEqual(['user']);
  });
});

describe('enrichSchemasWithModuleNames', () => {
  it('sets moduleName from module whose route references the schema', () => {
    const ir = createMinimalIR({
      modules: [
        {
          ...makeModule('users'),
          routers: [
            {
              name: 'usersRouter',
              moduleName: 'users',
              prefix: '/users',
              inject: [],
              routes: [
                {
                  method: 'POST',
                  path: '/',
                  fullPath: '/users',
                  operationId: 'users_createUser',
                  body: {
                    kind: 'named',
                    schemaName: 'createUserBody',
                    sourceFile: 'src/schemas/user.ts',
                  },
                  middleware: [],
                  tags: [],
                  sourceFile: 'src/modules/users/routes.ts',
                  sourceLine: 1,
                  sourceColumn: 1,
                },
              ],
              sourceFile: 'src/modules/users/routes.ts',
              sourceLine: 1,
              sourceColumn: 1,
            },
          ],
        },
      ],
      schemas: [
        {
          name: 'createUserBody',
          isNamed: false,
          moduleName: '',
          namingConvention: { operation: 'create', entity: 'User', part: 'Body' },
          sourceFile: 'src/schemas/user.ts',
          sourceLine: 1,
          sourceColumn: 1,
        },
      ],
    });

    const enriched = enrichSchemasWithModuleNames(ir);

    expect(enriched.schemas[0].moduleName).toBe('users');
  });

  it('keeps empty moduleName for schemas not referenced by any route', () => {
    const ir = createMinimalIR({
      modules: [makeModule('users')],
      schemas: [
        {
          name: 'orphanSchema',
          isNamed: true,
          moduleName: '',
          namingConvention: {},
          sourceFile: 'src/schemas/shared.ts',
          sourceLine: 1,
          sourceColumn: 1,
        },
      ],
    });

    const enriched = enrichSchemasWithModuleNames(ir);

    expect(enriched.schemas[0].moduleName).toBe('');
  });

  it('assigns different moduleNames when schemas are referenced by different modules', () => {
    const ir = createMinimalIR({
      modules: [
        {
          ...makeModule('users'),
          routers: [
            {
              name: 'usersRouter',
              moduleName: 'users',
              prefix: '/users',
              inject: [],
              routes: [
                {
                  method: 'POST',
                  path: '/',
                  fullPath: '/users',
                  operationId: 'users_create',
                  body: {
                    kind: 'named',
                    schemaName: 'createUserBody',
                    sourceFile: 'src/schemas/user.ts',
                  },
                  middleware: [],
                  tags: [],
                  sourceFile: 'src/routes.ts',
                  sourceLine: 1,
                  sourceColumn: 1,
                },
              ],
              sourceFile: 'src/routes.ts',
              sourceLine: 1,
              sourceColumn: 1,
            },
          ],
        },
        {
          ...makeModule('orders'),
          routers: [
            {
              name: 'ordersRouter',
              moduleName: 'orders',
              prefix: '/orders',
              inject: [],
              routes: [
                {
                  method: 'POST',
                  path: '/',
                  fullPath: '/orders',
                  operationId: 'orders_create',
                  body: {
                    kind: 'named',
                    schemaName: 'createOrderBody',
                    sourceFile: 'src/schemas/order.ts',
                  },
                  middleware: [],
                  tags: [],
                  sourceFile: 'src/routes.ts',
                  sourceLine: 1,
                  sourceColumn: 1,
                },
              ],
              sourceFile: 'src/routes.ts',
              sourceLine: 1,
              sourceColumn: 1,
            },
          ],
        },
      ],
      schemas: [
        {
          name: 'createUserBody',
          isNamed: false,
          moduleName: '',
          namingConvention: {},
          sourceFile: 'src/schemas/user.ts',
          sourceLine: 1,
          sourceColumn: 1,
        },
        {
          name: 'createOrderBody',
          isNamed: false,
          moduleName: '',
          namingConvention: {},
          sourceFile: 'src/schemas/order.ts',
          sourceLine: 1,
          sourceColumn: 1,
        },
      ],
    });

    const enriched = enrichSchemasWithModuleNames(ir);

    expect(enriched.schemas.find((s) => s.name === 'createUserBody')?.moduleName).toBe('users');
    expect(enriched.schemas.find((s) => s.name === 'createOrderBody')?.moduleName).toBe('orders');
  });

  it('does not mutate the original IR', () => {
    const ir = createMinimalIR({
      schemas: [
        {
          name: 'testSchema',
          isNamed: false,
          moduleName: '',
          namingConvention: {},
          sourceFile: 'src/schemas/test.ts',
          sourceLine: 1,
          sourceColumn: 1,
        },
      ],
    });

    const enriched = enrichSchemasWithModuleNames(ir);

    expect(ir.schemas[0].moduleName).toBe('');
    expect(enriched).not.toBe(ir);
    expect(enriched.schemas).not.toBe(ir.schemas);
  });
});
