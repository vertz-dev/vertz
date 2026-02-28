import { describe, expect, it } from 'bun:test';
import { ErrorCode } from '../../core/errors';
import { LiteralSchema } from '../literal';

describe('LiteralSchema', () => {
  it('accepts exact string value', () => {
    const schema = new LiteralSchema('hello');
    expect(schema.parse('hello').data).toBe('hello');
  });

  it('accepts exact number, boolean, and null values', () => {
    expect(new LiteralSchema(42).parse(42).data).toBe(42);
    expect(new LiteralSchema(true).parse(true).data).toBe(true);
    expect(new LiteralSchema(null).parse(null).data).toBe(null);
  });

  it('rejects non-matching values with InvalidLiteral', () => {
    const schema = new LiteralSchema('hello');
    const result = schema.safeParse('world');
    expect(result.ok).toBe(false);
    if (!result.ok) {
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
