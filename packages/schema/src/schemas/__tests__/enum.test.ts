import { describe, expect, it } from 'bun:test';
import { ErrorCode } from '../../core/errors';
import { EnumSchema } from '../enum';

describe('EnumSchema', () => {
  it('accepts valid enum values', () => {
    const schema = new EnumSchema(['red', 'green', 'blue']);
    expect(schema.parse('red').data).toBe('red');
    expect(schema.parse('green').data).toBe('green');
    expect(schema.parse('blue').data).toBe('blue');
  });

  it('rejects invalid values with InvalidEnumValue', () => {
    const schema = new EnumSchema(['red', 'green', 'blue']);
    const result = schema.safeParse('yellow');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.InvalidEnumValue);
    }
  });

  it('.exclude(values) creates new enum without specified values', () => {
    const schema = new EnumSchema(['red', 'green', 'blue']);
    const excluded = schema.exclude(['red']);
    expect(excluded.parse('green').data).toBe('green');
    expect(excluded.safeParse('red').ok).toBe(false);
  });

  it('.extract(values) creates new enum with only specified values', () => {
    const schema = new EnumSchema(['red', 'green', 'blue']);
    const extracted = schema.extract(['red', 'green']);
    expect(extracted.parse('red').data).toBe('red');
    expect(extracted.safeParse('blue').ok).toBe(false);
  });

  it('.toJSONSchema() returns { enum: [...] }', () => {
    const schema = new EnumSchema(['red', 'green', 'blue']);
    expect(schema.toJSONSchema()).toEqual({ enum: ['red', 'green', 'blue'] });
  });

  it('rejects non-string values with InvalidEnumValue', () => {
    const schema = new EnumSchema(['red', 'green', 'blue']);
    for (const value of [42, true, null, undefined, {}, []]) {
      const result = schema.safeParse(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.issues[0]?.code).toBe(ErrorCode.InvalidEnumValue);
      }
    }
  });
});
