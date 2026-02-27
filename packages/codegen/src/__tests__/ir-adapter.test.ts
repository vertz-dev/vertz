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
});
