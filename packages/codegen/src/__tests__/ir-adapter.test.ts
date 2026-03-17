import { describe, expect, it } from 'bun:test';
import type { AppIR, SchemaIR } from '@vertz/compiler';
import { adaptIR } from '../ir-adapter';

// ── Fixture helpers ──────────────────────────────────────────────

const loc = { sourceFile: 'test.ts', sourceLine: 1, sourceColumn: 1 };

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
    expect(result.entities).toEqual([]);
    expect(result.auth.schemes).toEqual([]);
    expect(result.basePath).toBe('/api');
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

  describe('Schema collection', () => {
    it('collects named schemas into CodegenIR.schemas', () => {
      const bodySchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      };
      const appIR = makeAppIR({
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

  describe('Schema name collision resolution', () => {
    it('prefixes colliding schema names with module name', () => {
      const appIR = makeAppIR({
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

    it('does not prefix non-colliding schema names', () => {
      const appIR = makeAppIR({
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

  describe('Metadata extraction', () => {
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

  describe('Deterministic sorting', () => {
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
  });

  describe('Auth operations', () => {
    it('returns empty operations when no auth is configured', () => {
      const appIR = makeAppIR({});
      const result = adaptIR(appIR);

      expect(result.auth.operations).toEqual([]);
    });

    it('returns empty operations when auth has no features', () => {
      const appIR = makeAppIR({ auth: { features: [] } });
      const result = adaptIR(appIR);

      expect(result.auth.operations).toEqual([]);
    });

    it('includes core operations when any auth feature is configured', () => {
      const appIR = makeAppIR({ auth: { features: ['emailPassword'] } });
      const result = adaptIR(appIR);

      const opIds = result.auth.operations.map((o) => o.operationId);
      expect(opIds).toContain('signOut');
      expect(opIds).toContain('session');
      expect(opIds).toContain('refresh');
    });

    it('includes signIn and signUp for emailPassword feature', () => {
      const appIR = makeAppIR({ auth: { features: ['emailPassword'] } });
      const result = adaptIR(appIR);

      const opIds = result.auth.operations.map((o) => o.operationId);
      expect(opIds).toContain('signIn');
      expect(opIds).toContain('signUp');

      const signIn = result.auth.operations.find((o) => o.operationId === 'signIn');
      expect(signIn?.method).toBe('POST');
      expect(signIn?.path).toBe('/signin');
      expect(signIn?.hasBody).toBe(true);
    });

    it('includes switchTenant for tenant feature', () => {
      const appIR = makeAppIR({ auth: { features: ['tenant'] } });
      const result = adaptIR(appIR);

      const opIds = result.auth.operations.map((o) => o.operationId);
      expect(opIds).toContain('switchTenant');
      expect(opIds).not.toContain('signIn');

      const switchTenant = result.auth.operations.find((o) => o.operationId === 'switchTenant');
      expect(switchTenant?.method).toBe('POST');
      expect(switchTenant?.path).toBe('/switch-tenant');
      expect(switchTenant?.hasBody).toBe(true);
    });

    it('includes providers for providers feature', () => {
      const appIR = makeAppIR({ auth: { features: ['providers'] } });
      const result = adaptIR(appIR);

      const opIds = result.auth.operations.map((o) => o.operationId);
      expect(opIds).toContain('providers');

      const providers = result.auth.operations.find((o) => o.operationId === 'providers');
      expect(providers?.method).toBe('GET');
      expect(providers?.hasBody).toBe(false);
    });

    it('combines all features', () => {
      const appIR = makeAppIR({
        auth: { features: ['emailPassword', 'tenant', 'providers'] },
      });
      const result = adaptIR(appIR);

      const opIds = result.auth.operations.map((o) => o.operationId);
      expect(opIds).toContain('signIn');
      expect(opIds).toContain('signUp');
      expect(opIds).toContain('switchTenant');
      expect(opIds).toContain('providers');
      expect(opIds).toContain('signOut');
      expect(opIds).toContain('session');
      expect(opIds).toContain('refresh');
    });
  });

  describe('Access data', () => {
    it('passes access data through when present', () => {
      const appIR = makeAppIR({
        access: {
          entities: [
            { name: 'workspace', roles: ['admin', 'member'] },
            { name: 'project', roles: ['manager'] },
          ],
          entitlements: ['workspace:invite', 'project:view'],
          whereClauses: [],
          ...loc,
        },
      });

      const result = adaptIR(appIR);
      expect(result.access).toBeDefined();
      expect(result.access?.entitlements).toEqual(['workspace:invite', 'project:view']);
      expect(result.access?.entities).toEqual([
        { name: 'workspace', roles: ['admin', 'member'] },
        { name: 'project', roles: ['manager'] },
      ]);
    });

    it('sets access to undefined when not present', () => {
      const appIR = makeAppIR({});
      const result = adaptIR(appIR);
      expect(result.access).toBeUndefined();
    });
  });
});
