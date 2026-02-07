import { describe, it, expect } from 'vitest';
import { StringSchema } from '../string';
import { ParseError } from '../../core/errors';

describe('StringSchema', () => {
  it('accepts a valid string', () => {
    const schema = new StringSchema();
    expect(schema.parse('hello')).toBe('hello');
  });

  it('rejects non-string values', () => {
    const schema = new StringSchema();
    for (const value of [42, true, null, undefined, {}, []]) {
      const result = schema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ParseError);
      }
    }
  });

  it('.min(n) accepts at boundary and rejects below', () => {
    const schema = new StringSchema().min(3);
    expect(schema.parse('abc')).toBe('abc');
    expect(schema.parse('abcd')).toBe('abcd');
    expect(() => schema.parse('ab')).toThrow(ParseError);
  });

  it('.max(n) accepts at boundary and rejects above', () => {
    const schema = new StringSchema().max(5);
    expect(schema.parse('abcde')).toBe('abcde');
    expect(schema.parse('abc')).toBe('abc');
    expect(() => schema.parse('abcdef')).toThrow(ParseError);
  });

  it('.length(n) accepts exact length and rejects different', () => {
    const schema = new StringSchema().length(4);
    expect(schema.parse('abcd')).toBe('abcd');
    expect(() => schema.parse('abc')).toThrow(ParseError);
    expect(() => schema.parse('abcde')).toThrow(ParseError);
  });

  it('.length(n, message) supports custom error message', () => {
    const schema = new StringSchema().length(4, 'Must be 4 chars');
    const result = schema.safeParse('ab');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toBe('Must be 4 chars');
    }
  });

  it('.regex(pattern) accepts matching, rejects non-matching with descriptive message', () => {
    const schema = new StringSchema().regex(/^[a-z]+$/);
    expect(schema.parse('hello')).toBe('hello');
    const result = schema.safeParse('Hello123');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toBe('Invalid: must match /^[a-z]+$/');
    }
  });

  it('.startsWith(), .endsWith(), .includes() validate substrings', () => {
    const schema = new StringSchema().startsWith('hello');
    expect(schema.parse('hello world')).toBe('hello world');
    expect(() => schema.parse('world hello')).toThrow(ParseError);

    const schema2 = new StringSchema().endsWith('world');
    expect(schema2.parse('hello world')).toBe('hello world');
    expect(() => schema2.parse('world hello')).toThrow(ParseError);

    const schema3 = new StringSchema().includes('mid');
    expect(schema3.parse('a mid b')).toBe('a mid b');
    expect(() => schema3.parse('no match')).toThrow(ParseError);
  });

  it('.uppercase() validates all uppercase and .lowercase() validates all lowercase', () => {
    const upper = new StringSchema().uppercase();
    expect(upper.parse('HELLO')).toBe('HELLO');
    expect(() => upper.parse('Hello')).toThrow(ParseError);

    const lower = new StringSchema().lowercase();
    expect(lower.parse('hello')).toBe('hello');
    expect(() => lower.parse('Hello')).toThrow(ParseError);
  });

  it('.trim() trims whitespace before validation', () => {
    const schema = new StringSchema().trim().min(3);
    expect(schema.parse('  hello  ')).toBe('hello');
    expect(() => schema.parse('  ab  ')).toThrow(ParseError);
  });

  it('.toLowerCase(), .toUpperCase(), .normalize() transform the value', () => {
    expect(new StringSchema().toLowerCase().parse('HELLO')).toBe('hello');
    expect(new StringSchema().toUpperCase().parse('hello')).toBe('HELLO');
    expect(new StringSchema().normalize().parse('\u00e9')).toBe('\u00e9');
    expect(new StringSchema().normalize().parse('e\u0301')).toBe('\u00e9');
  });

  it('supports per-rule custom error messages', () => {
    const schema = new StringSchema().min(5, 'Too short').max(10, 'Too long');
    const minResult = schema.safeParse('ab');
    expect(minResult.success).toBe(false);
    if (!minResult.success) {
      expect(minResult.error.issues[0]!.message).toBe('Too short');
    }
    const maxResult = schema.safeParse('a]'.repeat(6));
    expect(maxResult.success).toBe(false);
    if (!maxResult.success) {
      expect(maxResult.error.issues[0]!.message).toBe('Too long');
    }
  });

  it('.toJSONSchema() returns type with minLength, maxLength, pattern', () => {
    const schema = new StringSchema()
      .min(1)
      .max(100)
      .regex(/^[a-z]+$/);
    expect(schema.toJSONSchema()).toEqual({
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^[a-z]+$',
    });
  });
});
