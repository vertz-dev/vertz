import { describe, expect, it } from 'bun:test';
import { ErrorCode } from '../../core/errors';
import { ArraySchema } from '../array';
import { NumberSchema } from '../number';
import { StringSchema } from '../string';

describe('ArraySchema', () => {
  it('accepts a valid array of elements', () => {
    const schema = new ArraySchema(new StringSchema());
    expect(schema.parse(['a', 'b', 'c']).data).toEqual(['a', 'b', 'c']);
  });

  it('rejects non-array values', () => {
    const schema = new ArraySchema(new StringSchema());
    for (const value of ['hello', 42, true, null, undefined, {}]) {
      const result = schema.safeParse(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.issues[0]?.code).toBe(ErrorCode.InvalidType);
      }
    }
  });

  it('validates each element and reports errors with array index in path', () => {
    const schema = new ArraySchema(new NumberSchema());
    const result = schema.safeParse([1, 'bad', 3, 'also bad']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues.length).toBe(2);
      expect(result.error.issues[0]?.path).toEqual([1]);
      expect(result.error.issues[1]?.path).toEqual([3]);
    }
  });

  it('.min(n) rejects arrays shorter than minimum', () => {
    const schema = new ArraySchema(new StringSchema()).min(2);
    expect(schema.parse(['a', 'b']).data).toEqual(['a', 'b']);
    const result = schema.safeParse(['a']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.TooSmall);
    }
  });

  it('.max(n) rejects arrays longer than maximum', () => {
    const schema = new ArraySchema(new StringSchema()).max(2);
    expect(schema.parse(['a', 'b']).data).toEqual(['a', 'b']);
    const result = schema.safeParse(['a', 'b', 'c']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.TooBig);
    }
  });

  it('.length(n) rejects arrays with wrong length using InvalidType', () => {
    const schema = new ArraySchema(new StringSchema()).length(3);
    expect(schema.parse(['a', 'b', 'c']).data).toEqual(['a', 'b', 'c']);
    const tooShort = schema.safeParse(['a']);
    expect(tooShort.ok).toBe(false);
    if (!tooShort.ok) {
      expect(tooShort.error.issues[0]?.code).toBe(ErrorCode.InvalidType);
    }
    const tooLong = schema.safeParse(['a', 'b', 'c', 'd']);
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) {
      expect(tooLong.error.issues[0]?.code).toBe(ErrorCode.InvalidType);
    }
  });

  it('.toJSONSchema() returns type, items, minItems, maxItems', () => {
    const schema = new ArraySchema(new NumberSchema()).min(1).max(10);
    expect(schema.toJSONSchema()).toEqual({
      type: 'array',
      items: { type: 'number' },
      minItems: 1,
      maxItems: 10,
    });
  });
});
