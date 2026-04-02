import { describe, expect, it } from 'bun:test';
import type { ParsedResource, ParsedSchema } from '../../parser/types';
import { jsonSchemaToZod } from '../json-schema-to-zod';
import { generateSchemas } from '../schema-generator';

const empty = new Map<string, string>();

describe('jsonSchemaToZod', () => {
  describe('basic types', () => {
    it('maps string to z.string()', () => {
      expect(jsonSchemaToZod({ type: 'string' }, empty)).toBe('z.string()');
    });

    it('maps number to z.number()', () => {
      expect(jsonSchemaToZod({ type: 'number' }, empty)).toBe('z.number()');
    });

    it('maps integer to z.number().int()', () => {
      expect(jsonSchemaToZod({ type: 'integer' }, empty)).toBe('z.number().int()');
    });

    it('maps boolean to z.boolean()', () => {
      expect(jsonSchemaToZod({ type: 'boolean' }, empty)).toBe('z.boolean()');
    });
  });

  describe('string formats', () => {
    it('maps format: email to z.string().email()', () => {
      expect(jsonSchemaToZod({ type: 'string', format: 'email' }, empty)).toBe(
        'z.string().email()',
      );
    });

    it('maps format: uuid to z.string().uuid()', () => {
      expect(jsonSchemaToZod({ type: 'string', format: 'uuid' }, empty)).toBe('z.string().uuid()');
    });

    it('maps format: date-time to z.string().datetime()', () => {
      expect(jsonSchemaToZod({ type: 'string', format: 'date-time' }, empty)).toBe(
        'z.string().datetime()',
      );
    });

    it('maps format: uri to z.string().url()', () => {
      expect(jsonSchemaToZod({ type: 'string', format: 'uri' }, empty)).toBe('z.string().url()');
    });
  });

  describe('string constraints', () => {
    it('maps minLength to .min()', () => {
      expect(jsonSchemaToZod({ type: 'string', minLength: 1 }, empty)).toBe('z.string().min(1)');
    });

    it('maps maxLength to .max()', () => {
      expect(jsonSchemaToZod({ type: 'string', maxLength: 100 }, empty)).toBe(
        'z.string().max(100)',
      );
    });

    it('maps pattern to .regex()', () => {
      expect(jsonSchemaToZod({ type: 'string', pattern: '^[a-z]+$' }, empty)).toBe(
        'z.string().regex(/^[a-z]+$/)',
      );
    });
  });

  describe('numeric constraints', () => {
    it('maps minimum to .min()', () => {
      expect(jsonSchemaToZod({ type: 'number', minimum: 0 }, empty)).toBe('z.number().min(0)');
    });

    it('maps maximum to .max()', () => {
      expect(jsonSchemaToZod({ type: 'number', maximum: 100 }, empty)).toBe('z.number().max(100)');
    });
  });

  describe('arrays', () => {
    it('maps array to z.array()', () => {
      expect(jsonSchemaToZod({ type: 'array', items: { type: 'string' } }, empty)).toBe(
        'z.array(z.string())',
      );
    });
  });

  describe('enums', () => {
    it('maps string enum to z.enum()', () => {
      expect(jsonSchemaToZod({ enum: ['active', 'inactive'] }, empty)).toBe(
        "z.enum(['active', 'inactive'])",
      );
    });

    it('maps numeric enum to z.union of z.literal()', () => {
      expect(jsonSchemaToZod({ enum: [1, 2, 3] }, empty)).toBe(
        'z.union([z.literal(1), z.literal(2), z.literal(3)])',
      );
    });

    it('maps mixed enum to z.union of z.literal()', () => {
      expect(jsonSchemaToZod({ enum: ['a', 1, true] }, empty)).toBe(
        "z.union([z.literal('a'), z.literal(1), z.literal(true)])",
      );
    });
  });

  describe('nullable', () => {
    it('maps nullable to .nullable()', () => {
      expect(jsonSchemaToZod({ type: ['string', 'null'] }, empty)).toBe('z.string().nullable()');
    });

    it('maps anyOf with null to .nullable() (OpenAPI 3.1)', () => {
      expect(jsonSchemaToZod({ anyOf: [{ type: 'string' }, { type: 'null' }] }, empty)).toBe(
        'z.string().nullable()',
      );
    });

    it('maps anyOf with integer and null to z.number().int().nullable()', () => {
      expect(jsonSchemaToZod({ anyOf: [{ type: 'integer' }, { type: 'null' }] }, empty)).toBe(
        'z.number().int().nullable()',
      );
    });

    it('maps anyOf with multiple non-null types to z.union()', () => {
      expect(jsonSchemaToZod({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, empty)).toBe(
        'z.union([z.string(), z.number().int()])',
      );
    });

    it('maps anyOf with multiple types and null to z.union().nullable()', () => {
      expect(
        jsonSchemaToZod(
          { anyOf: [{ type: 'string' }, { type: 'integer' }, { type: 'null' }] },
          empty,
        ),
      ).toBe('z.union([z.string(), z.number().int()]).nullable()');
    });
  });

  describe('default values', () => {
    it('maps default to .default()', () => {
      expect(jsonSchemaToZod({ type: 'string', default: 'hello' }, empty)).toBe(
        "z.string().default('hello')",
      );
    });

    it('maps numeric default', () => {
      expect(jsonSchemaToZod({ type: 'number', default: 42 }, empty)).toBe(
        'z.number().default(42)',
      );
    });

    it('maps boolean default', () => {
      expect(jsonSchemaToZod({ type: 'boolean', default: false }, empty)).toBe(
        'z.boolean().default(false)',
      );
    });
  });

  describe('circular references', () => {
    it('uses z.lazy() for $circular sentinel', () => {
      const named = new Map([['Category', 'categorySchema']]);
      expect(jsonSchemaToZod({ $circular: 'Category' }, named)).toBe(
        'z.lazy(() => categorySchema)',
      );
    });
  });

  describe('objects', () => {
    it('maps object with properties', () => {
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          count: { type: 'number' },
        },
        required: ['id'],
      };
      const result = jsonSchemaToZod(schema, empty);
      expect(result).toContain('z.object({');
      expect(result).toContain('id: z.string()');
      expect(result).toContain('count: z.number().optional()');
    });
  });

  describe('objects with special-character keys', () => {
    it('quotes property names with special characters', () => {
      const schema = {
        type: 'object',
        properties: {
          'x-custom': { type: 'string' },
          '@type': { type: 'string' },
          normalKey: { type: 'number' },
        },
      };
      const result = jsonSchemaToZod(schema, empty);
      expect(result).toContain("'x-custom': z.string()");
      expect(result).toContain("'@type': z.string()");
      expect(result).toContain('normalKey: z.number()');
    });
  });

  describe('fallback', () => {
    it('returns z.unknown() for empty schema', () => {
      expect(jsonSchemaToZod({}, empty)).toBe('z.unknown()');
    });
  });
});

describe('generateSchemas', () => {
  function makeResource(overrides: Partial<ParsedResource> = {}): ParsedResource {
    return {
      name: 'Tasks',
      identifier: 'tasks',
      operations: [],
      ...overrides,
    };
  }

  it('generates schemas/<resource>.ts with Zod schemas', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'createTask',
            methodName: 'create',
            method: 'POST',
            path: '/tasks',
            pathParams: [],
            queryParams: [],
            requestBody: {
              name: 'CreateTaskInput',
              jsonSchema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  done: { type: 'boolean' },
                },
                required: ['title'],
              },
            },
            responseStatus: 201,
            tags: ['tasks'],
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateSchemas(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'schemas/tasks.ts');
    expect(tasksFile).toBeDefined();
    expect(tasksFile!.content).toContain("import { z } from 'zod';");
    expect(tasksFile!.content).toContain('export const createTaskInputSchema = z.object({');
    expect(tasksFile!.content).toContain('title: z.string()');
    expect(tasksFile!.content).toContain('done: z.boolean().optional()');
  });

  it('generates schemas/index.ts barrel export', () => {
    const resources: ParsedResource[] = [makeResource()];
    const schemas: ParsedSchema[] = [];

    const files = generateSchemas(resources, schemas);
    const indexFile = files.find((f) => f.path === 'schemas/index.ts');
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain("export * from './tasks';");
  });

  it('generates response schemas', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'getTask',
            methodName: 'get',
            method: 'GET',
            path: '/tasks/{taskId}',
            pathParams: [{ name: 'taskId', required: true, schema: { type: 'string' } }],
            queryParams: [],
            response: {
              name: 'Task',
              jsonSchema: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  title: { type: 'string' },
                },
                required: ['id', 'title'],
              },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateSchemas(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'schemas/tasks.ts');
    expect(tasksFile!.content).toContain('export const taskSchema = z.object({');
    expect(tasksFile!.content).toContain('id: z.string().uuid()');
    expect(tasksFile!.content).toContain('title: z.string()');
  });

  it('generates query schemas', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'listTasks',
            methodName: 'list',
            method: 'GET',
            path: '/tasks',
            pathParams: [],
            queryParams: [
              { name: 'status', required: false, schema: { type: 'string' } },
              { name: 'limit', required: false, schema: { type: 'integer' } },
            ],
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateSchemas(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'schemas/tasks.ts');
    expect(tasksFile!.content).toContain('export const listTasksQuerySchema = z.object({');
    expect(tasksFile!.content).toContain('status: z.string().optional()');
    expect(tasksFile!.content).toContain('limit: z.number().int().optional()');
  });
});
