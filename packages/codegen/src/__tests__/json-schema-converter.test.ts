import { describe, expect, it } from 'vitest';
import { jsonSchemaToTS } from '../json-schema-converter';

describe('jsonSchemaToTS', () => {
  describe('primitives', () => {
    it('converts string type', () => {
      const result = jsonSchemaToTS({ type: 'string' });
      expect(result.type).toBe('string');
      expect(result.extractedTypes.size).toBe(0);
    });

    it('converts number type', () => {
      const result = jsonSchemaToTS({ type: 'number' });
      expect(result.type).toBe('number');
    });

    it('converts integer to number', () => {
      const result = jsonSchemaToTS({ type: 'integer' });
      expect(result.type).toBe('number');
    });

    it('converts boolean type', () => {
      const result = jsonSchemaToTS({ type: 'boolean' });
      expect(result.type).toBe('boolean');
    });

    it('converts null type', () => {
      const result = jsonSchemaToTS({ type: 'null' });
      expect(result.type).toBe('null');
    });
  });

  describe('nullable type arrays', () => {
    it('converts ["string", "null"] to string | null', () => {
      const result = jsonSchemaToTS({ type: ['string', 'null'] });
      expect(result.type).toBe('string | null');
    });
  });

  describe('objects', () => {
    it('converts object with required and optional properties', () => {
      const result = jsonSchemaToTS({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      });
      expect(result.type).toBe('{ name: string; age?: number }');
    });

    it('converts object with all required properties', () => {
      const result = jsonSchemaToTS({
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['id', 'name'],
      });
      expect(result.type).toBe('{ id: string; name: string }');
    });

    it('converts empty object to Record<string, unknown>', () => {
      const result = jsonSchemaToTS({ type: 'object' });
      expect(result.type).toBe('Record<string, unknown>');
    });
  });

  describe('arrays', () => {
    it('converts array with items', () => {
      const result = jsonSchemaToTS({
        type: 'array',
        items: { type: 'string' },
      });
      expect(result.type).toBe('string[]');
    });

    it('wraps union item types in parens', () => {
      const result = jsonSchemaToTS({
        type: 'array',
        items: { type: ['string', 'null'] },
      });
      expect(result.type).toBe('(string | null)[]');
    });

    it('converts array without items to unknown[]', () => {
      const result = jsonSchemaToTS({ type: 'array' });
      expect(result.type).toBe('unknown[]');
    });
  });

  describe('tuples', () => {
    it('converts prefixItems to tuple type', () => {
      const result = jsonSchemaToTS({
        type: 'array',
        prefixItems: [{ type: 'string' }, { type: 'number' }],
        items: false,
      });
      expect(result.type).toBe('[string, number]');
    });
  });

  describe('enums and const', () => {
    it('converts string enum to union of literals', () => {
      const result = jsonSchemaToTS({ enum: ['admin', 'user', 'guest'] });
      expect(result.type).toBe("'admin' | 'user' | 'guest'");
    });

    it('converts numeric enum', () => {
      const result = jsonSchemaToTS({ enum: [1, 2, 3] });
      expect(result.type).toBe('1 | 2 | 3');
    });

    it('converts const string value', () => {
      const result = jsonSchemaToTS({ const: 'active' });
      expect(result.type).toBe("'active'");
    });

    it('converts const number value', () => {
      const result = jsonSchemaToTS({ const: 42 });
      expect(result.type).toBe('42');
    });

    it('converts const boolean value', () => {
      const result = jsonSchemaToTS({ const: true });
      expect(result.type).toBe('true');
    });

    it('converts const null value', () => {
      const result = jsonSchemaToTS({ const: null });
      expect(result.type).toBe('null');
    });
  });

  describe('union types', () => {
    it('converts oneOf to union', () => {
      const result = jsonSchemaToTS({
        oneOf: [{ type: 'string' }, { type: 'number' }],
      });
      expect(result.type).toBe('string | number');
    });

    it('converts anyOf to union', () => {
      const result = jsonSchemaToTS({
        anyOf: [{ type: 'string' }, { type: 'boolean' }],
      });
      expect(result.type).toBe('string | boolean');
    });

    it('converts discriminated union as regular union', () => {
      const result = jsonSchemaToTS({
        oneOf: [
          { type: 'object', properties: { kind: { const: 'a' } }, required: ['kind'] },
          { type: 'object', properties: { kind: { const: 'b' } }, required: ['kind'] },
        ],
        discriminator: { propertyName: 'kind' },
      });
      expect(result.type).toBe("{ kind: 'a' } | { kind: 'b' }");
    });
  });

  describe('intersection types', () => {
    it('converts allOf to intersection', () => {
      const result = jsonSchemaToTS({
        allOf: [
          { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
          { type: 'object', properties: { age: { type: 'number' } }, required: ['age'] },
        ],
      });
      expect(result.type).toBe('{ name: string } & { age: number }');
    });
  });

  describe('$ref resolution', () => {
    it('resolves $ref to #/$defs/Name as type name', () => {
      const result = jsonSchemaToTS({ $ref: '#/$defs/Address' });
      expect(result.type).toBe('Address');
    });

    it('resolves $ref to #/components/schemas/Name', () => {
      const result = jsonSchemaToTS({ $ref: '#/components/schemas/User' });
      expect(result.type).toBe('User');
    });
  });

  describe('record types', () => {
    it('converts additionalProperties to Record<string, T>', () => {
      const result = jsonSchemaToTS({
        type: 'object',
        additionalProperties: { type: 'number' },
      });
      expect(result.type).toBe('Record<string, number>');
    });
  });

  describe('$defs extraction', () => {
    it('extracts $defs as named types and resolves $ref', () => {
      const result = jsonSchemaToTS({
        $defs: {
          Address: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
        $ref: '#/$defs/Address',
      });
      expect(result.type).toBe('Address');
      expect(result.extractedTypes.get('Address')).toBe('{ city: string }');
    });

    it('extracts multiple $defs', () => {
      const result = jsonSchemaToTS({
        $defs: {
          Name: { type: 'string' },
          Age: { type: 'number' },
        },
        type: 'object',
        properties: {
          name: { $ref: '#/$defs/Name' },
          age: { $ref: '#/$defs/Age' },
        },
        required: ['name', 'age'],
      });
      expect(result.type).toBe('{ name: Name; age: Age }');
      expect(result.extractedTypes.get('Name')).toBe('string');
      expect(result.extractedTypes.get('Age')).toBe('number');
    });
  });

  describe('recursive schemas', () => {
    it('handles recursive $ref without infinite loop', () => {
      const result = jsonSchemaToTS({
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
            required: ['value', 'children'],
          },
        },
        $ref: '#/$defs/TreeNode',
      });
      expect(result.type).toBe('TreeNode');
      expect(result.extractedTypes.get('TreeNode')).toBe('{ value: string; children: TreeNode[] }');
    });
  });

  describe('error handling', () => {
    it('returns unknown for unsupported schema', () => {
      const result = jsonSchemaToTS({});
      expect(result.type).toBe('unknown');
    });

    it('throws for external $ref URLs', () => {
      expect(() => jsonSchemaToTS({ $ref: 'https://example.com/schema.json' })).toThrow(
        'External $ref is not supported',
      );
    });
  });

  describe('nested schemas', () => {
    it('converts nested object properties', () => {
      const result = jsonSchemaToTS({
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              zip: { type: 'string' },
            },
            required: ['street', 'zip'],
          },
        },
        required: ['address'],
      });
      expect(result.type).toBe('{ address: { street: string; zip: string } }');
    });

    it('converts array of objects', () => {
      const result = jsonSchemaToTS({
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['id', 'name'],
        },
      });
      expect(result.type).toBe('{ id: string; name: string }[]');
    });

    it('converts object with $ref property', () => {
      const result = jsonSchemaToTS({
        type: 'object',
        properties: {
          user: { $ref: '#/$defs/User' },
          role: { type: 'string' },
        },
        required: ['user', 'role'],
      });
      expect(result.type).toBe('{ user: User; role: string }');
    });
  });

  describe('shared context', () => {
    it('accumulates named types across multiple calls with shared context', () => {
      const ctx = { namedTypes: new Map<string, string>(), resolving: new Set<string>() };

      jsonSchemaToTS(
        {
          $defs: { Foo: { type: 'string' } },
          $ref: '#/$defs/Foo',
        },
        ctx,
      );

      jsonSchemaToTS(
        {
          $defs: { Bar: { type: 'number' } },
          $ref: '#/$defs/Bar',
        },
        ctx,
      );

      expect(ctx.namedTypes.size).toBe(2);
      expect(ctx.namedTypes.get('Foo')).toBe('string');
      expect(ctx.namedTypes.get('Bar')).toBe('number');
    });
  });

  describe('ignored properties', () => {
    it('ignores format for type generation', () => {
      const result = jsonSchemaToTS({ type: 'string', format: 'uuid' });
      expect(result.type).toBe('string');
    });

    it('ignores default and description', () => {
      const result = jsonSchemaToTS({
        type: 'string',
        default: 'hello',
        description: 'A greeting',
      });
      expect(result.type).toBe('string');
    });
  });

  describe('complex compositions', () => {
    it('converts oneOf with object sub-schemas', () => {
      const result = jsonSchemaToTS({
        oneOf: [
          {
            type: 'object',
            properties: { type: { const: 'email' }, email: { type: 'string' } },
            required: ['type', 'email'],
          },
          {
            type: 'object',
            properties: { type: { const: 'sms' }, phone: { type: 'string' } },
            required: ['type', 'phone'],
          },
        ],
      });
      expect(result.type).toBe("{ type: 'email'; email: string } | { type: 'sms'; phone: string }");
    });

    it('converts allOf with $ref sub-schemas', () => {
      const result = jsonSchemaToTS({
        allOf: [{ $ref: '#/$defs/Base' }, { $ref: '#/$defs/Extra' }],
      });
      expect(result.type).toBe('Base & Extra');
    });

    it('handles $defs that reference other $defs', () => {
      const result = jsonSchemaToTS({
        $defs: {
          Street: { type: 'string' },
          Address: {
            type: 'object',
            properties: { street: { $ref: '#/$defs/Street' } },
            required: ['street'],
          },
        },
        $ref: '#/$defs/Address',
      });
      expect(result.type).toBe('Address');
      expect(result.extractedTypes.get('Street')).toBe('string');
      expect(result.extractedTypes.get('Address')).toBe('{ street: Street }');
    });
  });
});
