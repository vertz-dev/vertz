import { describe, expect, it } from 'bun:test';
import { generateInterface, getTypePrefix, jsonSchemaToTS, toPascalCase } from '../json-schema-to-ts';

describe('jsonSchemaToTS', () => {
  const empty = new Map<string, string>();

  describe('primitive types', () => {
    it('maps string type', () => {
      expect(jsonSchemaToTS({ type: 'string' }, empty)).toBe('string');
    });

    it('maps number type', () => {
      expect(jsonSchemaToTS({ type: 'number' }, empty)).toBe('number');
    });

    it('maps integer to number', () => {
      expect(jsonSchemaToTS({ type: 'integer' }, empty)).toBe('number');
    });

    it('maps boolean type', () => {
      expect(jsonSchemaToTS({ type: 'boolean' }, empty)).toBe('boolean');
    });
  });

  describe('arrays', () => {
    it('maps array with typed items', () => {
      expect(jsonSchemaToTS({ type: 'array', items: { type: 'string' } }, empty)).toBe('string[]');
    });

    it('maps array with object items using named reference', () => {
      const named = new Map([['Task', 'Task']]);
      expect(
        jsonSchemaToTS(
          { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } },
          named,
        ),
      ).toBe('{ id?: string }[]');
    });
  });

  describe('objects', () => {
    it('maps object with properties to inline type', () => {
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
      };
      expect(jsonSchemaToTS(schema, empty)).toBe('{ id?: string; name?: string }');
    });

    it('marks required properties without ?', () => {
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['id'],
      };
      expect(jsonSchemaToTS(schema, empty)).toBe('{ id: string; name?: string }');
    });
  });

  describe('enums', () => {
    it('maps string enums to literal union', () => {
      expect(jsonSchemaToTS({ enum: ['active', 'inactive', 'archived'] }, empty)).toBe(
        "'active' | 'inactive' | 'archived'",
      );
    });
  });

  describe('nullable', () => {
    it('maps nullable type array to T | null', () => {
      expect(jsonSchemaToTS({ type: ['string', 'null'] }, empty)).toBe('string | null');
    });

    it('maps anyOf with null to T | null (OpenAPI 3.1 nullable)', () => {
      expect(jsonSchemaToTS({ anyOf: [{ type: 'string' }, { type: 'null' }] }, empty)).toBe(
        'string | null',
      );
    });

    it('maps anyOf with null and integer to number | null', () => {
      expect(jsonSchemaToTS({ anyOf: [{ type: 'integer' }, { type: 'null' }] }, empty)).toBe(
        'number | null',
      );
    });

    it('maps anyOf with multiple non-null types to union', () => {
      expect(jsonSchemaToTS({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, empty)).toBe(
        'string | number',
      );
    });

    it('maps anyOf with multiple types and null', () => {
      expect(
        jsonSchemaToTS(
          { anyOf: [{ type: 'string' }, { type: 'integer' }, { type: 'null' }] },
          empty,
        ),
      ).toBe('string | number | null');
    });

    it('maps anyOf with object ref and null', () => {
      expect(jsonSchemaToTS({ anyOf: [{ $circular: 'Task' }, { type: 'null' }] }, empty)).toBe(
        'Task | null',
      );
    });
  });

  describe('circular references', () => {
    it('uses named type for $circular sentinel', () => {
      expect(jsonSchemaToTS({ $circular: 'Category' }, empty)).toBe('Category');
    });
  });

  describe('additionalProperties', () => {
    it('maps additionalProperties: true to Record<string, unknown>', () => {
      expect(jsonSchemaToTS({ type: 'object', additionalProperties: true }, empty)).toBe(
        'Record<string, unknown>',
      );
    });
  });

  describe('fallback', () => {
    it('returns unknown for empty schema', () => {
      expect(jsonSchemaToTS({}, empty)).toBe('unknown');
    });

    it('returns unknown for unrecognized schema', () => {
      expect(jsonSchemaToTS({ something: 'weird' }, empty)).toBe('unknown');
    });
  });

  describe('safety', () => {
    it('escapes single quotes in enum values', () => {
      expect(jsonSchemaToTS({ enum: ["it's", "won't"] }, empty)).toBe("'it\\'s' | 'won\\'t'");
    });

    it('handles numeric enum values without quotes', () => {
      expect(jsonSchemaToTS({ enum: [1, 2, 3] }, empty)).toBe('1 | 2 | 3');
    });

    it('quotes property names with special characters', () => {
      const schema = {
        type: 'object',
        properties: {
          'x-custom': { type: 'string' },
          normal: { type: 'string' },
        },
      };
      const result = jsonSchemaToTS(schema, empty);
      expect(result).toContain("'x-custom'?: string");
      expect(result).toContain('normal?: string');
    });
  });

  describe('named schema references', () => {
    it('uses named type when schema matches a known name', () => {
      const named = new Map([['TaskSchema', 'Task']]);
      // When a schema has a name that maps to a TS interface, use the name
      expect(jsonSchemaToTS({ $circular: 'Task' }, named)).toBe('Task');
    });
  });
});

describe('generateInterface', () => {
  const empty = new Map<string, string>();

  it('produces export interface declaration', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['id', 'title'],
    };
    const result = generateInterface('Task', schema, empty);
    expect(result).toContain('export interface Task {');
    expect(result).toContain('  id: string;');
    expect(result).toContain('  title: string;');
    expect(result).toContain('}');
  });

  it('marks optional properties with ?', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['id'],
    };
    const result = generateInterface('Task', schema, empty);
    expect(result).toContain('  id: string;');
    expect(result).toContain('  description?: string;');
  });

  it('handles nested object properties', () => {
    const schema = {
      type: 'object',
      properties: {
        meta: {
          type: 'object',
          properties: {
            createdAt: { type: 'string' },
          },
        },
      },
    };
    const result = generateInterface('Task', schema, empty);
    expect(result).toContain('  meta?: { createdAt?: string }');
  });

  it('handles array properties', () => {
    const schema = {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
      },
    };
    const result = generateInterface('Task', schema, empty);
    expect(result).toContain('  tags?: string[]');
  });

  it('handles enum properties', () => {
    const schema = {
      type: 'object',
      properties: {
        status: { enum: ['open', 'closed'] },
      },
    };
    const result = generateInterface('Task', schema, empty);
    expect(result).toContain("  status?: 'open' | 'closed'");
  });

  it('handles nullable properties', () => {
    const schema = {
      type: 'object',
      properties: {
        deletedAt: { type: ['string', 'null'] },
      },
    };
    const result = generateInterface('Task', schema, empty);
    expect(result).toContain('  deletedAt?: string | null');
  });

  it('produces empty interface for schema without properties', () => {
    const schema = { type: 'object' };
    const result = generateInterface('Empty', schema, empty);
    expect(result).toBe('export interface Empty {}\n');
  });

  it('sanitizes interface names with hyphens to valid TS identifiers', () => {
    const schema = {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    };
    const result = generateInterface('BrandModel-Output', schema, empty);
    expect(result).toContain('export interface BrandModelOutput {');
    expect(result).not.toContain('BrandModel-Output');
  });

  it('sanitizes interface names starting with numbers', () => {
    const schema = {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
    };
    const result = generateInterface('123Response', schema, empty);
    expect(result).toContain('export interface _123Response {');
  });
});

describe('toPascalCase', () => {
  it('converts underscore-separated words', () => {
    expect(toPascalCase('find_many_brands')).toBe('FindManyBrands');
  });

  it('converts double-underscore-separated FastAPI operationIds', () => {
    expect(toPascalCase('find_many_web_organizations__organization_id__brands__get')).toBe(
      'FindManyWebOrganizationsOrganizationIdBrandsGet',
    );
  });

  it('preserves already-PascalCased input', () => {
    expect(toPascalCase('CreateTask')).toBe('CreateTask');
  });

  it('preserves camelCase segments without lowercasing', () => {
    expect(toPascalCase('createTask')).toBe('CreateTask');
  });

  it('handles single word', () => {
    expect(toPascalCase('task')).toBe('Task');
  });

  it('handles empty string', () => {
    expect(toPascalCase('')).toBe('_');
  });

  it('handles digit-prefixed result', () => {
    expect(toPascalCase('123_response')).toBe('_123Response');
  });

  it('handles hyphen-separated names', () => {
    expect(toPascalCase('brand-model-output')).toBe('BrandModelOutput');
  });

  it('handles consecutive separators', () => {
    expect(toPascalCase('foo___bar')).toBe('FooBar');
  });
});

describe('getTypePrefix', () => {
  it('returns typePrefix when set', () => {
    expect(
      getTypePrefix({
        typePrefix: 'FindMany',
        methodName: 'findMany',
      }),
    ).toBe('FindMany');
  });

  it('falls back to PascalCase of methodName when typePrefix is undefined (#2415)', () => {
    expect(
      getTypePrefix({
        typePrefix: undefined,
        methodName: 'findMany',
      }),
    ).toBe('FindMany');
  });

  it('uses methodName fallback for CRUD method names', () => {
    expect(
      getTypePrefix({
        typePrefix: undefined,
        methodName: 'list',
      }),
    ).toBe('List');
  });
});

describe('edge cases', () => {
  const empty = new Map<string, string>();

  it('handles nullable with non-primitive type', () => {
    expect(jsonSchemaToTS({ type: ['integer', 'null'] }, empty)).toBe('number | null');
  });

  it('handles nullable with unknown type', () => {
    expect(jsonSchemaToTS({ type: ['object', 'null'] }, empty)).toBe('unknown | null');
  });
});
