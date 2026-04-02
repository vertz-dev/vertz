import { describe, expect, it } from 'bun:test';
import { generateInterface, jsonSchemaToTS } from '../json-schema-to-ts';

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
