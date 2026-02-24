import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'bun:test';
import type { AppIR, ModuleIR, RouteIR, RouterIR, SchemaIR } from '../../ir/types';
import {
  adaptIR,
  emitClientFile,
  emitModuleFile,
  emitSharedTypesFile,
  emitTypesFile,
  jsonSchemaToTS,
} from './spike';

describe('Unknown 1: jsonSchemaToTS', () => {
  describe('primitives', () => {
    it('converts string type', () => {
      expect(jsonSchemaToTS({ type: 'string' })).toBe('string');
    });

    it('converts number type', () => {
      expect(jsonSchemaToTS({ type: 'number' })).toBe('number');
    });

    it('converts integer to number', () => {
      expect(jsonSchemaToTS({ type: 'integer' })).toBe('number');
    });

    it('converts boolean type', () => {
      expect(jsonSchemaToTS({ type: 'boolean' })).toBe('boolean');
    });
  });

  describe('nullable (type arrays)', () => {
    it('converts string | null', () => {
      expect(jsonSchemaToTS({ type: ['string', 'null'] })).toBe('string | null');
    });
  });

  describe('objects', () => {
    it('converts object with required and optional properties', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };
      expect(jsonSchemaToTS(schema)).toBe('{ name: string; age?: number }');
    });
  });

  describe('arrays', () => {
    it('converts array of strings', () => {
      expect(jsonSchemaToTS({ type: 'array', items: { type: 'string' } })).toBe('string[]');
    });
  });

  describe('tuples', () => {
    it('converts prefixItems to tuple type', () => {
      const schema = {
        type: 'array',
        prefixItems: [{ type: 'string' }, { type: 'number' }],
        items: false,
      };
      expect(jsonSchemaToTS(schema)).toBe('[string, number]');
    });
  });

  describe('enums', () => {
    it('converts string enum to union of literals', () => {
      expect(jsonSchemaToTS({ type: 'string', enum: ['admin', 'user'] })).toBe("'admin' | 'user'");
    });

    it('converts const to literal type', () => {
      expect(jsonSchemaToTS({ const: 'success' })).toBe("'success'");
    });
  });

  describe('unions', () => {
    it('converts oneOf to union', () => {
      const schema = { oneOf: [{ type: 'string' }, { type: 'number' }] };
      expect(jsonSchemaToTS(schema)).toBe('string | number');
    });

    it('converts anyOf to union', () => {
      const schema = { anyOf: [{ type: 'string' }, { type: 'number' }] };
      expect(jsonSchemaToTS(schema)).toBe('string | number');
    });
  });

  describe('intersections', () => {
    it('converts allOf to intersection', () => {
      const schema = {
        allOf: [
          { type: 'object', properties: { a: { type: 'string' } } },
          { type: 'object', properties: { b: { type: 'number' } } },
        ],
      };
      expect(jsonSchemaToTS(schema)).toBe('{ a?: string } & { b?: number }');
    });
  });

  describe('$ref to named types', () => {
    it('resolves $ref to $defs name', () => {
      expect(jsonSchemaToTS({ $ref: '#/$defs/UserId' })).toBe('UserId');
    });

    it('resolves $ref to components/schemas name', () => {
      expect(jsonSchemaToTS({ $ref: '#/components/schemas/User' })).toBe('User');
    });
  });

  describe('Record / additionalProperties', () => {
    it('converts object with additionalProperties to Record', () => {
      const schema = { type: 'object', additionalProperties: { type: 'number' } };
      expect(jsonSchemaToTS(schema)).toBe('Record<string, number>');
    });

    it('ignores additionalProperties: false on regular object', () => {
      const schema = {
        type: 'object',
        properties: { a: { type: 'string' } },
        additionalProperties: false,
      };
      expect(jsonSchemaToTS(schema)).toBe('{ a?: string }');
    });
  });

  describe('discriminated unions with $ref', () => {
    it('converts oneOf with $ref and discriminator to union', () => {
      const schema = {
        oneOf: [{ $ref: '#/$defs/Cat' }, { $ref: '#/$defs/Dog' }],
        discriminator: { propertyName: 'type' },
      };
      expect(jsonSchemaToTS(schema)).toBe('Cat | Dog');
    });
  });

  describe('nested named schemas ($defs)', () => {
    it('extracts $defs as named types and resolves main $ref', () => {
      const namedTypes = new Map<string, string>();
      const schema = {
        $defs: {
          Address: {
            type: 'object',
            properties: { street: { type: 'string' } },
          },
        },
        $ref: '#/$defs/Address',
      };
      const result = jsonSchemaToTS(schema, namedTypes);
      expect(result).toBe('Address');
      expect(namedTypes.get('Address')).toBe('{ street?: string }');
    });
  });

  describe('recursive schema', () => {
    it('handles circular reference without infinite recursion', () => {
      const namedTypes = new Map<string, string>();
      const schema = {
        $defs: {
          TreeNode: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              children: {
                type: 'array',
                items: { $ref: '#/$defs/TreeNode' },
              },
            },
          },
        },
        $ref: '#/$defs/TreeNode',
      };
      const result = jsonSchemaToTS(schema, namedTypes);
      expect(result).toBe('TreeNode');
      expect(namedTypes.has('TreeNode')).toBe(true);
      // The named type should reference TreeNode (circular ref resolved to name)
      expect(namedTypes.get('TreeNode')).toContain('TreeNode');
    });
  });

  describe('formats (pass through as string)', () => {
    it('treats format uuid as string', () => {
      expect(jsonSchemaToTS({ type: 'string', format: 'uuid' })).toBe('string');
    });

    it('treats format email as string', () => {
      expect(jsonSchemaToTS({ type: 'string', format: 'email' })).toBe('string');
    });

    it('treats format date-time as string', () => {
      expect(jsonSchemaToTS({ type: 'string', format: 'date-time' })).toBe('string');
    });
  });

  describe('default values (ignored for type gen)', () => {
    it('does not break with default value present', () => {
      expect(jsonSchemaToTS({ type: 'string', default: 'unknown' })).toBe('string');
    });
  });

  describe('description (ignored for type gen)', () => {
    it('does not break with description present', () => {
      expect(jsonSchemaToTS({ type: 'string', description: 'A user name' })).toBe('string');
    });
  });
});

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

// ── Unknown 2: adaptIR ──────────────────────────────────────────

describe('Unknown 2: adaptIR', () => {
  describe('single module with CRUD routes', () => {
    it('flattens module → router → routes into flat operations', () => {
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                name: 'UsersRouter',
                moduleName: 'users',
                prefix: '/users',
                routes: [
                  makeRoute({
                    method: 'GET',
                    path: '/',
                    fullPath: '/users',
                    operationId: 'listUsers',
                    response: {
                      kind: 'named',
                      schemaName: 'ListUsersResponse',
                      sourceFile: 'test.ts',
                    },
                  }),
                  makeRoute({
                    method: 'GET',
                    path: '/:id',
                    fullPath: '/users/:id',
                    operationId: 'getUser',
                    params: {
                      kind: 'inline',
                      sourceFile: 'test.ts',
                      jsonSchema: {
                        type: 'object',
                        properties: { id: { type: 'string' } },
                        required: ['id'],
                      },
                    },
                    response: {
                      kind: 'named',
                      schemaName: 'ReadUserResponse',
                      sourceFile: 'test.ts',
                    },
                  }),
                  makeRoute({
                    method: 'POST',
                    path: '/',
                    fullPath: '/users',
                    operationId: 'createUser',
                    body: {
                      kind: 'named',
                      schemaName: 'CreateUserBody',
                      sourceFile: 'test.ts',
                    },
                    response: {
                      kind: 'named',
                      schemaName: 'ReadUserResponse',
                      sourceFile: 'test.ts',
                    },
                  }),
                  makeRoute({
                    method: 'PUT',
                    path: '/:id',
                    fullPath: '/users/:id',
                    operationId: 'updateUser',
                    body: {
                      kind: 'named',
                      schemaName: 'UpdateUserBody',
                      sourceFile: 'test.ts',
                    },
                  }),
                  makeRoute({
                    method: 'DELETE',
                    path: '/:id',
                    fullPath: '/users/:id',
                    operationId: 'deleteUser',
                  }),
                ],
              }),
            ],
          }),
        ],
        schemas: [
          makeSchema({
            name: 'ListUsersResponse',
            jsonSchema: { type: 'array', items: { $ref: '#/$defs/ReadUserResponse' } },
          }),
          makeSchema({
            name: 'ReadUserResponse',
            jsonSchema: {
              type: 'object',
              properties: { id: { type: 'string' }, name: { type: 'string' } },
              required: ['id', 'name'],
            },
          }),
          makeSchema({
            name: 'CreateUserBody',
            jsonSchema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          }),
          makeSchema({
            name: 'UpdateUserBody',
            jsonSchema: {
              type: 'object',
              properties: { name: { type: 'string' } },
            },
          }),
        ],
      });

      const result = adaptIR(appIR);

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0]?.name).toBe('users');
      expect(result.modules[0]?.operations).toHaveLength(5);
      expect(result.modules[0]?.operations[0]?.operationId).toBe('listUsers');
      expect(result.modules[0]?.operations[0]?.method).toBe('GET');
      expect(result.modules[0]?.operations[0]?.fullPath).toBe('/users');
    });
  });

  describe('multi-module', () => {
    it('flattens multiple modules into separate entries', () => {
      const appIR = makeAppIR({
        modules: [
          makeModule({
            name: 'users',
            routers: [
              makeRouter({
                name: 'UsersRouter',
                moduleName: 'users',
                prefix: '/users',
                routes: [
                  makeRoute({
                    method: 'GET',
                    path: '/',
                    fullPath: '/users',
                    operationId: 'listUsers',
                  }),
                ],
              }),
            ],
          }),
          makeModule({
            name: 'orders',
            routers: [
              makeRouter({
                name: 'OrdersRouter',
                moduleName: 'orders',
                prefix: '/orders',
                routes: [
                  makeRoute({
                    method: 'GET',
                    path: '/',
                    fullPath: '/orders',
                    operationId: 'listOrders',
                  }),
                  makeRoute({
                    method: 'POST',
                    path: '/',
                    fullPath: '/orders',
                    operationId: 'createOrder',
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = adaptIR(appIR);

      expect(result.modules).toHaveLength(2);
      expect(result.modules[0]?.name).toBe('users');
      expect(result.modules[0]?.operations).toHaveLength(1);
      expect(result.modules[1]?.name).toBe('orders');
      expect(result.modules[1]?.operations).toHaveLength(2);
    });
  });

  describe('shared schema reference', () => {
    it('detects schemas used by multiple modules and moves them to shared', () => {
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
                    response: {
                      kind: 'named',
                      schemaName: 'ReadUserResponse',
                      sourceFile: 'test.ts',
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
                    operationId: 'getOrder',
                    response: {
                      kind: 'named',
                      schemaName: 'ReadOrderResponse',
                      sourceFile: 'test.ts',
                    },
                  }),
                  makeRoute({
                    operationId: 'getOrderUser',
                    response: {
                      kind: 'named',
                      schemaName: 'ReadUserResponse',
                      sourceFile: 'test.ts',
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
        schemas: [
          makeSchema({
            name: 'ReadUserResponse',
            jsonSchema: {
              type: 'object',
              properties: { id: { type: 'string' } },
            },
          }),
          makeSchema({
            name: 'ReadOrderResponse',
            jsonSchema: {
              type: 'object',
              properties: { orderId: { type: 'string' } },
            },
          }),
        ],
      });

      const result = adaptIR(appIR);

      // ReadUserResponse is used by both modules => shared
      expect(result.sharedSchemas).toContain('ReadUserResponse');
      // ReadOrderResponse is only used by orders => not shared
      expect(result.sharedSchemas).not.toContain('ReadOrderResponse');
    });
  });

  describe('schema name collision', () => {
    it('detects different schemas with the same name across modules and prefixes them', () => {
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
                    body: { kind: 'named', schemaName: 'CreateBody', sourceFile: 'users.ts' },
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
                    body: { kind: 'named', schemaName: 'CreateBody', sourceFile: 'orders.ts' },
                  }),
                ],
              }),
            ],
          }),
        ],
        schemas: [
          makeSchema({
            name: 'CreateBody',
            jsonSchema: {
              type: 'object',
              properties: { name: { type: 'string' } },
            },
            sourceFile: 'users.ts',
          }),
          makeSchema({
            name: 'CreateBody',
            jsonSchema: {
              type: 'object',
              properties: { productId: { type: 'string' } },
            },
            sourceFile: 'orders.ts',
          }),
        ],
      });

      const result = adaptIR(appIR);

      // Should detect the collision
      expect(result.collisions).toHaveLength(1);
      expect(result.collisions[0]?.name).toBe('CreateBody');
      expect(result.collisions[0]?.modules).toContain('users');
      expect(result.collisions[0]?.modules).toContain('orders');
    });
  });

  describe('operations collect schema references', () => {
    it('collects named schema references for each operation', () => {
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
                    body: { kind: 'named', schemaName: 'CreateUserBody', sourceFile: 'test.ts' },
                    response: {
                      kind: 'named',
                      schemaName: 'ReadUserResponse',
                      sourceFile: 'test.ts',
                    },
                    query: {
                      kind: 'inline',
                      sourceFile: 'test.ts',
                      jsonSchema: {
                        type: 'object',
                        properties: { verbose: { type: 'boolean' } },
                      },
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
        schemas: [makeSchema({ name: 'CreateUserBody' }), makeSchema({ name: 'ReadUserResponse' })],
      });

      const result = adaptIR(appIR);
      const op = result.modules[0]?.operations[0];
      expect(op?.schemaRefs).toContain('CreateUserBody');
      expect(op?.schemaRefs).toContain('ReadUserResponse');
    });
  });
});

// ── Unknown 3: Per-Module File Generation & Cross-Module Imports ──

describe('Unknown 3: File Generation', () => {
  // Schema fixtures for generation tests
  const userSchemas = {
    ReadUserResponse: {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' } },
      required: ['id', 'name', 'email'],
    },
    CreateUserBody: {
      type: 'object',
      properties: { name: { type: 'string' }, email: { type: 'string' } },
      required: ['name', 'email'],
    },
    ListUsersResponse: {
      type: 'array',
      items: { $ref: '#/$defs/ReadUserResponse' },
    },
  };

  const orderSchemas = {
    ReadOrderResponse: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        userId: { type: 'string' },
        total: { type: 'number' },
      },
      required: ['id', 'userId', 'total'],
    },
    CreateOrderBody: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        items: { type: 'array', items: { type: 'string' } },
      },
      required: ['userId', 'items'],
    },
  };

  describe('emitTypesFile', () => {
    it('generates valid TypeScript type declarations for a module', () => {
      const content = emitTypesFile('users', userSchemas);
      expect(content).toContain('export type ReadUserResponse');
      expect(content).toContain('export type CreateUserBody');
      expect(content).toContain('export type ListUsersResponse');
    });

    it('generates types with correct structure', () => {
      const content = emitTypesFile('users', {
        ReadUserResponse: userSchemas.ReadUserResponse,
      });
      expect(content).toContain('id: string');
      expect(content).toContain('name: string');
      expect(content).toContain('email: string');
    });
  });

  describe('emitSharedTypesFile', () => {
    it('generates shared types file with schemas used by multiple modules', () => {
      const content = emitSharedTypesFile({
        ReadUserResponse: userSchemas.ReadUserResponse,
      });
      expect(content).toContain('export type ReadUserResponse');
    });
  });

  describe('emitModuleFile', () => {
    it('generates module file with createXxxModule function', () => {
      const ops = [
        { operationId: 'listUsers', method: 'GET' as const, fullPath: '/users' },
        { operationId: 'getUser', method: 'GET' as const, fullPath: '/users/:id' },
        { operationId: 'createUser', method: 'POST' as const, fullPath: '/users' },
      ];
      const content = emitModuleFile('users', ops, ['../types/users']);
      expect(content).toContain('createUsersModule');
      expect(content).toContain('listUsers');
      expect(content).toContain('getUser');
      expect(content).toContain('createUser');
    });
  });

  describe('emitClientFile', () => {
    it('generates client file that imports and composes all modules', () => {
      const content = emitClientFile(['users', 'orders']);
      expect(content).toContain('import { createUsersModule }');
      expect(content).toContain('import { createOrdersModule }');
      expect(content).toContain('createClient');
    });
  });

  describe('end-to-end: generated files compile with tsc', () => {
    it('writes generated files to temp dir and verifies they compile', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'codegen-poc-'));
      const typesDir = join(tmpDir, 'types');
      const modulesDir = join(tmpDir, 'modules');
      mkdirSync(typesDir, { recursive: true });
      mkdirSync(modulesDir, { recursive: true });

      // Generate types files
      const usersTypes = emitTypesFile('users', userSchemas);
      writeFileSync(join(typesDir, 'users.ts'), usersTypes);

      const ordersTypes = emitTypesFile('orders', orderSchemas);
      writeFileSync(join(typesDir, 'orders.ts'), ordersTypes);

      // Shared types (ReadUserResponse used by both)
      const sharedTypes = emitSharedTypesFile({
        ReadUserResponse: userSchemas.ReadUserResponse,
      });
      writeFileSync(join(typesDir, 'shared.ts'), sharedTypes);

      // Module files
      const usersModule = emitModuleFile(
        'users',
        [
          { operationId: 'listUsers', method: 'GET', fullPath: '/users' },
          { operationId: 'getUser', method: 'GET', fullPath: '/users/:id' },
          { operationId: 'createUser', method: 'POST', fullPath: '/users' },
        ],
        ['../types/users'],
      );
      writeFileSync(join(modulesDir, 'users.ts'), usersModule);

      const ordersModule = emitModuleFile(
        'orders',
        [
          { operationId: 'listOrders', method: 'GET', fullPath: '/orders' },
          { operationId: 'createOrder', method: 'POST', fullPath: '/orders' },
        ],
        ['../types/orders', '../types/shared'],
      );
      writeFileSync(join(modulesDir, 'orders.ts'), ordersModule);

      // Client file
      const clientContent = emitClientFile(['users', 'orders']);
      writeFileSync(join(tmpDir, 'client.ts'), clientContent);

      // Write tsconfig for the temp dir
      const tsconfig = {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['**/*.ts'],
      };
      writeFileSync(join(tmpDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

      // Run tsc --noEmit using the compiler package's local tsc
      const __dirname2 = dirname(fileURLToPath(import.meta.url));
      const tscBin = resolve(__dirname2, '../../../node_modules/.bin/tsc');
      let tscResult: { success: boolean; output: string };
      try {
        const output = execSync(`${tscBin} --noEmit`, {
          cwd: tmpDir,
          encoding: 'utf-8',
          timeout: 25_000,
        });
        tscResult = { success: true, output };
      } catch (err) {
        const error = err as { stdout?: string; stderr?: string };
        tscResult = {
          success: false,
          output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
        };
      }

      expect(tscResult.success, `tsc failed:\n${tscResult.output}`).toBe(true);
    }, 30_000);
  });
});
