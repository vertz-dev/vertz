import type { AppIR, ModuleIR, RouteIR, RouterIR, SchemaIR } from '@vertz/compiler';
import { describe, expect, it } from 'vitest';
import { adaptIR } from '../ir-adapter';

// ── Fixture helpers ──────────────────────────────────────────────

const loc = { sourceFile: 'test.ts', sourceLine: 1, sourceColumn: 1 };

function makeRoute(overrides: Partial<RouteIR>): RouteIR {
  return {
    method: 'GET',
    path: '/',
    fullPath: '/',
    operationId: 'test',
    middleware: [],
    tags: [],
    ...loc,
    ...overrides,
  };
}

function makeRouter(overrides: Partial<RouterIR>): RouterIR {
  return {
    name: 'TestRouter',
    moduleName: 'test',
    prefix: '/',
    inject: [],
    routes: [],
    ...loc,
    ...overrides,
  };
}

function makeModule(overrides: Partial<ModuleIR>): ModuleIR {
  return {
    name: 'test',
    imports: [],
    services: [],
    routers: [],
    exports: [],
    ...loc,
    ...overrides,
  };
}

function makeSchema(overrides: Partial<SchemaIR>): SchemaIR {
  return {
    name: 'TestSchema',
    moduleName: 'test',
    namingConvention: {},
    isNamed: true,
    ...loc,
    ...overrides,
  };
}

function makeAppIR(overrides: Partial<AppIR>): AppIR {
  return {
    app: {
      basePath: '/api',
      globalMiddleware: [],
      moduleRegistrations: [],
      ...loc,
    },
    modules: [],
    middleware: [],
    schemas: [],
    dependencyGraph: {
      nodes: [],
      edges: [],
      initializationOrder: [],
      circularDependencies: [],
    },
    diagnostics: [],
    ...overrides,
  };
}

describe('adaptIR', () => {
  it('returns empty IR for an empty app', () => {
    const appIR = makeAppIR({});
    const result = adaptIR(appIR);

    expect(result.modules).toEqual([]);
    expect(result.schemas).toEqual([]);
    expect(result.auth.schemes).toEqual([]);
    expect(result.basePath).toBe('/api');
  });

  describe('Step 1: Flatten', () => {
    it('flattens a single module with one route into one module with one operation', () => {
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                prefix: '/users',
                routes: [
                  makeRoute({
                    method: 'GET',
                    path: '/',
                    fullPath: '/api/users',
                    operationId: 'listUsers',
                    tags: ['users'],
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = adaptIR(appIR);

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0]?.name).toBe('users');
      expect(result.modules[0]?.operations).toHaveLength(1);
      expect(result.modules[0]?.operations[0]?.operationId).toBe('listUsers');
      expect(result.modules[0]?.operations[0]?.method).toBe('GET');
      expect(result.modules[0]?.operations[0]?.path).toBe('/api/users');
      expect(result.modules[0]?.operations[0]?.tags).toEqual(['users']);
    });

    it('flattens multiple modules with multiple routers', () => {
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [makeRoute({ operationId: 'listUsers', fullPath: '/api/users' })],
              }),
            ],
          }),
          makeModule({
            name: 'orders',
            routers: [
              makeRouter({
                moduleName: 'orders',
                routes: [
                  makeRoute({ operationId: 'listOrders', fullPath: '/api/orders' }),
                  makeRoute({
                    operationId: 'createOrder',
                    method: 'POST',
                    fullPath: '/api/orders',
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = adaptIR(appIR);

      expect(result.modules).toHaveLength(2);
      // Sorted alphabetically
      expect(result.modules[0]?.name).toBe('orders');
      expect(result.modules[0]?.operations).toHaveLength(2);
      expect(result.modules[1]?.name).toBe('users');
      expect(result.modules[1]?.operations).toHaveLength(1);
    });

    it('carries all schema slots (params, query, body, headers, response) into operations', () => {
      const paramsSchema = { type: 'object', properties: { id: { type: 'string' } } };
      const querySchema = { type: 'object', properties: { verbose: { type: 'boolean' } } };
      const bodySchema = { type: 'object', properties: { name: { type: 'string' } } };
      const headersSchema = { type: 'object', properties: { 'x-tenant': { type: 'string' } } };
      const responseSchema = { type: 'object', properties: { ok: { type: 'boolean' } } };

      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [
                  makeRoute({
                    operationId: 'updateUser',
                    method: 'PUT',
                    fullPath: '/api/users/:id',
                    params: { kind: 'inline', sourceFile: 'test.ts', jsonSchema: paramsSchema },
                    query: { kind: 'inline', sourceFile: 'test.ts', jsonSchema: querySchema },
                    body: { kind: 'inline', sourceFile: 'test.ts', jsonSchema: bodySchema },
                    headers: { kind: 'inline', sourceFile: 'test.ts', jsonSchema: headersSchema },
                    response: { kind: 'inline', sourceFile: 'test.ts', jsonSchema: responseSchema },
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = adaptIR(appIR);
      const op = result.modules[0]?.operations[0];

      expect(op?.params).toEqual(paramsSchema);
      expect(op?.query).toEqual(querySchema);
      expect(op?.body).toEqual(bodySchema);
      expect(op?.headers).toEqual(headersSchema);
      expect(op?.response).toEqual(responseSchema);
    });

    it('passes description through to operations', () => {
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [
                  makeRoute({
                    operationId: 'listUsers',
                    fullPath: '/api/users',
                    description: 'List all users with pagination',
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = adaptIR(appIR);

      expect(result.modules[0]?.operations[0]?.description).toBe('List all users with pagination');
    });

    it('merges routes from multiple routers in the same module', () => {
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                name: 'UsersRouter',
                routes: [makeRoute({ operationId: 'listUsers', fullPath: '/api/users' })],
              }),
              makeRouter({
                moduleName: 'users',
                name: 'AdminUsersRouter',
                routes: [
                  makeRoute({ operationId: 'deleteUser', fullPath: '/api/admin/users/:id' }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = adaptIR(appIR);

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0]?.operations).toHaveLength(2);
    });

    it('carries inline schema JSON into operation fields', () => {
      const querySchema = {
        type: 'object',
        properties: { page: { type: 'number' } },
      };
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [
                  makeRoute({
                    operationId: 'listUsers',
                    fullPath: '/api/users',
                    query: {
                      kind: 'inline',
                      sourceFile: 'test.ts',
                      jsonSchema: querySchema,
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = adaptIR(appIR);
      const op = result.modules[0]?.operations[0];

      expect(op?.query).toEqual(querySchema);
      expect(op?.schemaRefs.query).toBeUndefined();
    });

    it('tracks named schema refs and resolves JSON from AppIR schemas', () => {
      const bodyJsonSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      };
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [
                  makeRoute({
                    operationId: 'createUser',
                    method: 'POST',
                    fullPath: '/api/users',
                    body: {
                      kind: 'named',
                      schemaName: 'CreateUserBody',
                      sourceFile: 'test.ts',
                      jsonSchema: bodyJsonSchema,
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
        schemas: [
          makeSchema({
            name: 'CreateUserBody',
            moduleName: 'users',
            jsonSchema: bodyJsonSchema,
          }),
        ],
      });

      const result = adaptIR(appIR);
      const op = result.modules[0]?.operations[0];

      expect(op?.schemaRefs.body).toBe('CreateUserBody');
      expect(op?.body).toEqual(bodyJsonSchema);
    });
  });

  it('excludes schemas without jsonSchema', () => {
    const appIR = makeAppIR({
      schemas: [
        makeSchema({ name: 'NoJson', moduleName: 'users' }),
        makeSchema({
          name: 'WithJson',
          moduleName: 'users',
          jsonSchema: { type: 'object' },
        }),
      ],
    });

    const result = adaptIR(appIR);

    expect(result.schemas).toHaveLength(1);
    expect(result.schemas[0]?.name).toBe('WithJson');
  });

  it('produces empty operations for a module with no routers', () => {
    const appIR = makeAppIR({
      modules: [makeModule({ name: 'empty', routers: [] })],
    });

    const result = adaptIR(appIR);

    expect(result.modules).toHaveLength(1);
    expect(result.modules[0]?.operations).toEqual([]);
  });

  it('handles route with no schemas at all', () => {
    const appIR = makeAppIR({
      modules: [
        makeModule({
          name: 'health',
          routers: [
            makeRouter({
              moduleName: 'health',
              routes: [
                makeRoute({
                  operationId: 'healthCheck',
                  method: 'GET',
                  fullPath: '/health',
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = adaptIR(appIR);
    const op = result.modules[0]?.operations[0];

    expect(op?.params).toBeUndefined();
    expect(op?.query).toBeUndefined();
    expect(op?.body).toBeUndefined();
    expect(op?.headers).toBeUndefined();
    expect(op?.response).toBeUndefined();
    expect(op?.schemaRefs.params).toBeUndefined();
    expect(op?.schemaRefs.query).toBeUndefined();
    expect(op?.schemaRefs.body).toBeUndefined();
  });

  describe('Step 2-3: Collect refs and detect shared schemas', () => {
    it('collects named schemas into CodegenIR.schemas', () => {
      const bodySchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      };
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [
                  makeRoute({
                    operationId: 'createUser',
                    method: 'POST',
                    fullPath: '/api/users',
                    body: {
                      kind: 'named',
                      schemaName: 'CreateUserBody',
                      sourceFile: 'test.ts',
                      jsonSchema: bodySchema,
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
        schemas: [
          makeSchema({
            name: 'CreateUserBody',
            moduleName: 'users',
            namingConvention: { operation: 'create', entity: 'User', part: 'Body' },
            jsonSchema: bodySchema,
          }),
        ],
      });

      const result = adaptIR(appIR);

      expect(result.schemas).toHaveLength(1);
      expect(result.schemas[0]?.name).toBe('CreateUserBody');
      expect(result.schemas[0]?.jsonSchema).toEqual(bodySchema);
      expect(result.schemas[0]?.annotations.namingParts).toEqual({
        operation: 'create',
        entity: 'User',
        part: 'Body',
      });
    });
  });

  describe('Step 4: Resolve name collisions', () => {
    it('prefixes colliding schema names with module name', () => {
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [
                  makeRoute({
                    operationId: 'createUser',
                    method: 'POST',
                    fullPath: '/api/users',
                    body: {
                      kind: 'named',
                      schemaName: 'CreateBody',
                      sourceFile: 'users.ts',
                      jsonSchema: { type: 'object', properties: { name: { type: 'string' } } },
                    },
                  }),
                ],
              }),
            ],
          }),
          makeModule({
            name: 'orders',
            routers: [
              makeRouter({
                moduleName: 'orders',
                routes: [
                  makeRoute({
                    operationId: 'createOrder',
                    method: 'POST',
                    fullPath: '/api/orders',
                    body: {
                      kind: 'named',
                      schemaName: 'CreateBody',
                      sourceFile: 'orders.ts',
                      jsonSchema: {
                        type: 'object',
                        properties: { productId: { type: 'string' } },
                      },
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
        schemas: [
          makeSchema({
            name: 'CreateBody',
            moduleName: 'users',
            sourceFile: 'users.ts',
            jsonSchema: { type: 'object', properties: { name: { type: 'string' } } },
          }),
          makeSchema({
            name: 'CreateBody',
            moduleName: 'orders',
            sourceFile: 'orders.ts',
            jsonSchema: { type: 'object', properties: { productId: { type: 'string' } } },
          }),
        ],
      });

      const result = adaptIR(appIR);
      const schemaNames = result.schemas.map((s) => s.name);

      expect(schemaNames).toContain('UsersCreateBody');
      expect(schemaNames).toContain('OrdersCreateBody');
      expect(schemaNames).not.toContain('CreateBody');
    });

    it('updates operation schemaRefs when collisions are resolved', () => {
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [
                  makeRoute({
                    operationId: 'createUser',
                    method: 'POST',
                    fullPath: '/api/users',
                    body: {
                      kind: 'named',
                      schemaName: 'CreateBody',
                      sourceFile: 'users.ts',
                      jsonSchema: { type: 'object', properties: { name: { type: 'string' } } },
                    },
                  }),
                ],
              }),
            ],
          }),
          makeModule({
            name: 'orders',
            routers: [
              makeRouter({
                moduleName: 'orders',
                routes: [
                  makeRoute({
                    operationId: 'createOrder',
                    method: 'POST',
                    fullPath: '/api/orders',
                    body: {
                      kind: 'named',
                      schemaName: 'CreateBody',
                      sourceFile: 'orders.ts',
                      jsonSchema: {
                        type: 'object',
                        properties: { productId: { type: 'string' } },
                      },
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
        schemas: [
          makeSchema({
            name: 'CreateBody',
            moduleName: 'users',
            sourceFile: 'users.ts',
            jsonSchema: { type: 'object', properties: { name: { type: 'string' } } },
          }),
          makeSchema({
            name: 'CreateBody',
            moduleName: 'orders',
            sourceFile: 'orders.ts',
            jsonSchema: { type: 'object', properties: { productId: { type: 'string' } } },
          }),
        ],
      });

      const result = adaptIR(appIR);
      const ordersModule = result.modules.find((m) => m.name === 'orders');
      const usersModule = result.modules.find((m) => m.name === 'users');

      expect(ordersModule?.operations[0]?.schemaRefs.body).toBe('OrdersCreateBody');
      expect(usersModule?.operations[0]?.schemaRefs.body).toBe('UsersCreateBody');
    });

    it('does not prefix non-colliding schema names', () => {
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [
                  makeRoute({
                    operationId: 'createUser',
                    method: 'POST',
                    fullPath: '/api/users',
                    body: {
                      kind: 'named',
                      schemaName: 'CreateUserBody',
                      sourceFile: 'test.ts',
                      jsonSchema: { type: 'object' },
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
        schemas: [
          makeSchema({
            name: 'CreateUserBody',
            moduleName: 'users',
            jsonSchema: { type: 'object' },
          }),
        ],
      });

      const result = adaptIR(appIR);

      expect(result.schemas[0]?.name).toBe('CreateUserBody');
    });
  });

  describe('Step 5: Name inline schemas', () => {
    it('derives names from operationId + slot for inline schemas', () => {
      const querySchema = {
        type: 'object',
        properties: { page: { type: 'number' } },
      };
      const responseSchema = {
        type: 'object',
        properties: { items: { type: 'array', items: { type: 'string' } } },
      };
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [
                  makeRoute({
                    operationId: 'listUsers',
                    fullPath: '/api/users',
                    query: {
                      kind: 'inline',
                      sourceFile: 'test.ts',
                      jsonSchema: querySchema,
                    },
                    response: {
                      kind: 'inline',
                      sourceFile: 'test.ts',
                      jsonSchema: responseSchema,
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = adaptIR(appIR);
      const schemaNames = result.schemas.map((s) => s.name);

      expect(schemaNames).toContain('ListUsersQuery');
      expect(schemaNames).toContain('ListUsersResponse');
    });

    it('names inline params and body schemas correctly', () => {
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [
                  makeRoute({
                    operationId: 'getUser',
                    fullPath: '/api/users/:id',
                    params: {
                      kind: 'inline',
                      sourceFile: 'test.ts',
                      jsonSchema: {
                        type: 'object',
                        properties: { id: { type: 'string' } },
                        required: ['id'],
                      },
                    },
                  }),
                  makeRoute({
                    operationId: 'createUser',
                    method: 'POST',
                    fullPath: '/api/users',
                    body: {
                      kind: 'inline',
                      sourceFile: 'test.ts',
                      jsonSchema: {
                        type: 'object',
                        properties: { name: { type: 'string' } },
                        required: ['name'],
                      },
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = adaptIR(appIR);
      const schemaNames = result.schemas.map((s) => s.name);

      expect(schemaNames).toContain('GetUserParams');
      expect(schemaNames).toContain('CreateUserBody');
    });

    it('does not create schemas for named refs (only for inline)', () => {
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [
                  makeRoute({
                    operationId: 'createUser',
                    method: 'POST',
                    fullPath: '/api/users',
                    body: {
                      kind: 'named',
                      schemaName: 'CreateUserBody',
                      sourceFile: 'test.ts',
                      jsonSchema: { type: 'object' },
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
        schemas: [
          makeSchema({
            name: 'CreateUserBody',
            moduleName: 'users',
            jsonSchema: { type: 'object' },
          }),
        ],
      });

      const result = adaptIR(appIR);
      // Should have exactly 1 schema (the named one), not 2
      expect(result.schemas).toHaveLength(1);
      expect(result.schemas[0]?.name).toBe('CreateUserBody');
    });
  });

  describe('Step 5: Inline schema annotations', () => {
    it('assigns empty namingParts to inline schemas', () => {
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [
                  makeRoute({
                    operationId: 'listUsers',
                    fullPath: '/api/users',
                    query: {
                      kind: 'inline',
                      sourceFile: 'test.ts',
                      jsonSchema: { type: 'object', properties: { page: { type: 'number' } } },
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = adaptIR(appIR);
      const inlineSchema = result.schemas.find((s) => s.name === 'ListUsersQuery');

      expect(inlineSchema?.annotations.namingParts).toEqual({});
    });
  });

  describe('Step 7: Extract metadata', () => {
    it('extracts basePath and version from AppIR', () => {
      const appIR = makeAppIR({
        app: {
          basePath: '/api/v1',
          version: '1.0.0',
          globalMiddleware: [],
          moduleRegistrations: [],
          ...loc,
        },
      });

      const result = adaptIR(appIR);

      expect(result.basePath).toBe('/api/v1');
      expect(result.version).toBe('1.0.0');
    });

    it('leaves version undefined when AppIR has no version', () => {
      const appIR = makeAppIR({});

      const result = adaptIR(appIR);

      expect(result.version).toBeUndefined();
    });
  });

  describe('Step 8: Sort deterministically', () => {
    it('sorts modules alphabetically by name', () => {
      const appIR = makeAppIR({
        modules: [
          makeModule({ name: 'orders', routers: [] }),
          makeModule({ name: 'auth', routers: [] }),
          makeModule({ name: 'users', routers: [] }),
        ],
      });

      const result = adaptIR(appIR);
      const names = result.modules.map((m) => m.name);

      expect(names).toEqual(['auth', 'orders', 'users']);
    });

    it('sorts schemas alphabetically by name', () => {
      const appIR = makeAppIR({
        schemas: [
          makeSchema({ name: 'UpdateUserBody', jsonSchema: { type: 'object' } }),
          makeSchema({ name: 'CreateUserBody', jsonSchema: { type: 'object' } }),
        ],
      });

      const result = adaptIR(appIR);
      const names = result.schemas.map((s) => s.name);

      expect(names).toEqual(['CreateUserBody', 'UpdateUserBody']);
    });

    it('sorts operations within a module by operationId', () => {
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [
                  makeRoute({ operationId: 'updateUser', fullPath: '/api/users/:id' }),
                  makeRoute({ operationId: 'createUser', fullPath: '/api/users' }),
                  makeRoute({ operationId: 'listUsers', fullPath: '/api/users' }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = adaptIR(appIR);
      const opIds = result.modules[0]?.operations.map((o) => o.operationId);

      expect(opIds).toEqual(['createUser', 'listUsers', 'updateUser']);
    });
  });

  describe('Integration: full pipeline', () => {
    it('adapts a realistic multi-module AppIR into a complete CodegenIR', () => {
      const appIR = makeAppIR({
        app: {
          basePath: '/api/v1',
          version: '2.0.0',
          globalMiddleware: [],
          moduleRegistrations: [],
          ...loc,
        },
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                moduleName: 'users',
                routes: [
                  makeRoute({
                    operationId: 'listUsers',
                    fullPath: '/api/v1/users',
                    query: {
                      kind: 'inline',
                      sourceFile: 'test.ts',
                      jsonSchema: {
                        type: 'object',
                        properties: { page: { type: 'number' }, limit: { type: 'number' } },
                      },
                    },
                    response: {
                      kind: 'named',
                      schemaName: 'ListUsersResponse',
                      sourceFile: 'test.ts',
                      jsonSchema: {
                        type: 'array',
                        items: { $ref: '#/$defs/User' },
                      },
                    },
                  }),
                  makeRoute({
                    operationId: 'createUser',
                    method: 'POST',
                    fullPath: '/api/v1/users',
                    body: {
                      kind: 'named',
                      schemaName: 'CreateUserBody',
                      sourceFile: 'test.ts',
                      jsonSchema: {
                        type: 'object',
                        properties: { name: { type: 'string' } },
                        required: ['name'],
                      },
                    },
                  }),
                ],
              }),
            ],
          }),
          makeModule({
            name: 'orders',
            routers: [
              makeRouter({
                moduleName: 'orders',
                routes: [
                  makeRoute({
                    operationId: 'listOrders',
                    fullPath: '/api/v1/orders',
                  }),
                ],
              }),
            ],
          }),
        ],
        schemas: [
          makeSchema({
            name: 'ListUsersResponse',
            moduleName: 'users',
            namingConvention: { operation: 'list', entity: 'Users', part: 'Response' },
            jsonSchema: { type: 'array', items: { $ref: '#/$defs/User' } },
          }),
          makeSchema({
            name: 'CreateUserBody',
            moduleName: 'users',
            namingConvention: { operation: 'create', entity: 'User', part: 'Body' },
            jsonSchema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          }),
        ],
      });

      const result = adaptIR(appIR);

      // Metadata
      expect(result.basePath).toBe('/api/v1');
      expect(result.version).toBe('2.0.0');

      // Modules sorted
      expect(result.modules.map((m) => m.name)).toEqual(['orders', 'users']);

      // Operations sorted within modules
      const usersModule = result.modules.find((m) => m.name === 'users');
      expect(usersModule?.operations.map((o) => o.operationId)).toEqual([
        'createUser',
        'listUsers',
      ]);

      // Named schemas collected
      expect(result.schemas.find((s) => s.name === 'CreateUserBody')).toBeDefined();
      expect(result.schemas.find((s) => s.name === 'ListUsersResponse')).toBeDefined();

      // Inline schemas named
      expect(result.schemas.find((s) => s.name === 'ListUsersQuery')).toBeDefined();

      // Schema refs on operations
      const createOp = usersModule?.operations.find((o) => o.operationId === 'createUser');
      expect(createOp?.schemaRefs.body).toBe('CreateUserBody');

      const listOp = usersModule?.operations.find((o) => o.operationId === 'listUsers');
      expect(listOp?.schemaRefs.response).toBe('ListUsersResponse');

      // Auth defaults to empty
      expect(result.auth.schemes).toEqual([]);
    });
  });
});
