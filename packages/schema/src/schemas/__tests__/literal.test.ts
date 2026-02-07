import { describe, it, expect } from 'vitest';
import { LiteralSchema } from '../literal';
import { ErrorCode } from '../../core/errors';

describe('LiteralSchema', () => {
  it('accepts exact string value', () => {
    const schema = new LiteralSchema('hello');
    expect(schema.parse('hello')).toBe('hello');
  });

  it('accepts exact number, boolean, and null values', () => {
    expect(new LiteralSchema(42).parse(42)).toBe(42);
    expect(new LiteralSchema(true).parse(true)).toBe(true);
    expect(new LiteralSchema(null).parse(null)).toBe(null);
  });

  it('rejects non-matching values with InvalidLiteral', () => {
    const schema = new LiteralSchema('hello');
    const result = schema.safeParse('world');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.InvalidLiteral);
    }
  });

  it('.toJSONSchema() returns { const: value }', () => {
    expect(new LiteralSchema('hello').toJSONSchema()).toEqual({ const: 'hello' });
    expect(new LiteralSchema(42).toJSONSchema()).toEqual({ const: 42 });
    expect(new LiteralSchema(true).toJSONSchema()).toEqual({ const: true });
    expect(new LiteralSchema(null).toJSONSchema()).toEqual({ const: null });
  });
});
