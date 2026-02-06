import { describe, it, expect } from 'vitest';
import { DiscriminatedUnionSchema } from '../discriminated-union';
import { ObjectSchema } from '../object';
import { StringSchema } from '../string';
import { NumberSchema } from '../number';
import { LiteralSchema } from '../literal';
import { ErrorCode } from '../../core/errors';

describe('DiscriminatedUnionSchema', () => {
  const catSchema = new ObjectSchema({ type: new LiteralSchema('cat'), meow: new StringSchema() });
  const dogSchema = new ObjectSchema({ type: new LiteralSchema('dog'), bark: new NumberSchema() });

  it('dispatches to correct schema based on discriminator', () => {
    const schema = new DiscriminatedUnionSchema('type', [catSchema, dogSchema]);
    expect(schema.parse({ type: 'cat', meow: 'loud' })).toEqual({ type: 'cat', meow: 'loud' });
    expect(schema.parse({ type: 'dog', bark: 3 })).toEqual({ type: 'dog', bark: 3 });
  });

  it('rejects missing discriminator property', () => {
    const schema = new DiscriminatedUnionSchema('type', [catSchema, dogSchema]);
    const result = schema.safeParse({ meow: 'loud' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.code).toBe(ErrorCode.InvalidUnion);
      expect(result.error.issues[0]!.message).toContain('Missing discriminator');
    }
  });

  it('rejects unknown discriminator value', () => {
    const schema = new DiscriminatedUnionSchema('type', [catSchema, dogSchema]);
    const result = schema.safeParse({ type: 'fish', fins: 2 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.code).toBe(ErrorCode.InvalidUnion);
      expect(result.error.issues[0]!.message).toContain("'fish'");
    }
  });

  it('.toJSONSchema() returns { oneOf, discriminator }', () => {
    const schema = new DiscriminatedUnionSchema('type', [catSchema, dogSchema]);
    expect(schema.toJSONSchema()).toEqual({
      oneOf: [
        { type: 'object', properties: { type: { const: 'cat' }, meow: { type: 'string' } }, required: ['type', 'meow'] },
        { type: 'object', properties: { type: { const: 'dog' }, bark: { type: 'number' } }, required: ['type', 'bark'] },
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
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.code).toBe(ErrorCode.InvalidType);
    }
  });
});
