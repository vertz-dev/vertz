import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../core/errors';
import { EnumSchema } from '../enum';

describe('EnumSchema', () => {
  it('accepts valid enum values', () => {
    const schema = new EnumSchema(['red', 'green', 'blue']);
    expect(schema.parse('red')).toBe('red');
    expect(schema.parse('green')).toBe('green');
    expect(schema.parse('blue')).toBe('blue');
  });

  it('rejects invalid values with InvalidEnumValue', () => {
    const schema = new EnumSchema(['red', 'green', 'blue']);
    const result = schema.safeParse('yellow');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.InvalidEnumValue);
    }
  });

  it('.exclude(values) creates new enum without specified values', () => {
    const schema = new EnumSchema(['red', 'green', 'blue']);
    const excluded = schema.exclude(['red']);
    expect(excluded.parse('green')).toBe('green');
    expect(excluded.safeParse('red').success).toBe(false);
  });

  it('.extract(values) creates new enum with only specified values', () => {
    const schema = new EnumSchema(['red', 'green', 'blue']);
    const extracted = schema.extract(['red', 'green']);
    expect(extracted.parse('red')).toBe('red');
    expect(extracted.safeParse('blue').success).toBe(false);
  });

  it('.toJSONSchema() returns { enum: [...] }', () => {
    const schema = new EnumSchema(['red', 'green', 'blue']);
    expect(schema.toJSONSchema()).toEqual({ enum: ['red', 'green', 'blue'] });
  });

  it('rejects non-string values with InvalidEnumValue', () => {
    const schema = new EnumSchema(['red', 'green', 'blue']);
    for (const value of [42, true, null, undefined, {}, []]) {
      const result = schema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.code).toBe(ErrorCode.InvalidEnumValue);
      }
    }
  });
});
