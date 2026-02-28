import { describe, expect, it } from 'bun:test';
import { ErrorCode } from '../../core/errors';
import { DiscriminatedUnionSchema } from '../discriminated-union';
import { LiteralSchema } from '../literal';
import { NumberSchema } from '../number';
import { ObjectSchema } from '../object';
import { StringSchema } from '../string';

describe('DiscriminatedUnionSchema', () => {
  const catSchema = new ObjectSchema({ type: new LiteralSchema('cat'), meow: new StringSchema() });
  const dogSchema = new ObjectSchema({ type: new LiteralSchema('dog'), bark: new NumberSchema() });

  it('dispatches to correct schema based on discriminator', () => {
    const schema = new DiscriminatedUnionSchema('type', [catSchema, dogSchema]);
    expect(schema.parse({ type: 'cat', meow: 'loud' }).data).toEqual({ type: 'cat', meow: 'loud' });
    expect(schema.parse({ type: 'dog', bark: 3 }).data).toEqual({ type: 'dog', bark: 3 });
  });

  it('rejects missing discriminator property', () => {
    const schema = new DiscriminatedUnionSchema('type', [catSchema, dogSchema]);
    const result = schema.safeParse({ meow: 'loud' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.InvalidUnion);
      expect(result.error.issues[0]?.message).toContain('Missing discriminator');
    }
  });

  it('rejects unknown discriminator value', () => {
    const schema = new DiscriminatedUnionSchema('type', [catSchema, dogSchema]);
    const result = schema.safeParse({ type: 'fish', fins: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.InvalidUnion);
      expect(result.error.issues[0]?.message).toContain("'fish'");
    }
  });

  it('.toJSONSchema() returns { oneOf, discriminator }', () => {
    const schema = new DiscriminatedUnionSchema('type', [catSchema, dogSchema]);
    expect(schema.toJSONSchema()).toEqual({
      oneOf: [
        {
          type: 'object',
          properties: { type: { const: 'cat' }, meow: { type: 'string' } },
          required: ['type', 'meow'],
        },
        {
          type: 'object',
          properties: { type: { const: 'dog' }, bark: { type: 'number' } },
          required: ['type', 'bark'],
        },
      ],
      discriminator: { propertyName: 'type' },
    });
  });

  it('throws when option has non-literal discriminator', () => {
    const badSchema = new ObjectSchema({ type: new StringSchema(), name: new StringSchema() });
    expect(() => new DiscriminatedUnionSchema('type', [catSchema, badSchema])).toThrow();
  });

  it('rejects non-object values', () => {
    const schema = new DiscriminatedUnionSchema('type', [catSchema, dogSchema]);
    const result = schema.safeParse('not-an-object');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.InvalidType);
    }
  });
});
