import { describe, expect, it } from 'bun:test';
import { ParseError } from '../../core/errors';
import { StringSchema } from '../string';

describe('StringSchema', () => {
  it('accepts a valid string', () => {
    const schema = new StringSchema();
    expect(schema.parse('hello').data).toBe('hello');
  });

  it('rejects non-string values', () => {
    const schema = new StringSchema();
    for (const value of [42, true, null, undefined, {}, []]) {
      const result = schema.safeParse(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ParseError);
      }
    }
  });

  it('.min(n) accepts at boundary and rejects below', () => {
    const schema = new StringSchema().min(3);
    expect(schema.parse('abc').data).toBe('abc');
    expect(schema.parse('abcd').data).toBe('abcd');
    expect(schema.parse('ab').ok).toBe(false);
  });

  it('.max(n) accepts at boundary and rejects above', () => {
    const schema = new StringSchema().max(5);
    expect(schema.parse('abcde').data).toBe('abcde');
    expect(schema.parse('abc').data).toBe('abc');
    expect(schema.parse('abcdef').ok).toBe(false);
  });

  it('.length(n) accepts exact length and rejects different', () => {
    const schema = new StringSchema().length(4);
    expect(schema.parse('abcd').data).toBe('abcd');
    expect(schema.parse('abc').ok).toBe(false);
    expect(schema.parse('abcde').ok).toBe(false);
  });

  it('.length(n, message) supports custom error message', () => {
    const schema = new StringSchema().length(4, 'Must be 4 chars');
    const result = schema.safeParse('ab');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.message).toBe('Must be 4 chars');
    }
  });

  it('.regex(pattern) accepts matching, rejects non-matching with descriptive message', () => {
    const schema = new StringSchema().regex(/^[a-z]+$/);
    expect(schema.parse('hello').data).toBe('hello');
    const result = schema.safeParse('Hello123');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.message).toBe('Invalid: must match /^[a-z]+$/');
    }
  });

  it('.startsWith(), .endsWith(), .includes() validate substrings', () => {
    const schema = new StringSchema().startsWith('hello');
    expect(schema.parse('hello world').data).toBe('hello world');
    expect(schema.parse('world hello').ok).toBe(false);

    const schema2 = new StringSchema().endsWith('world');
    expect(schema2.parse('hello world').data).toBe('hello world');
    expect(schema2.parse('world hello').ok).toBe(false);

    const schema3 = new StringSchema().includes('mid');
    expect(schema3.parse('a mid b').data).toBe('a mid b');
    expect(schema3.parse('no match').ok).toBe(false);
  });

  it('.uppercase() validates all uppercase and .lowercase() validates all lowercase', () => {
    const upper = new StringSchema().uppercase();
    expect(upper.parse('HELLO').data).toBe('HELLO');
    expect(upper.parse('Hello').ok).toBe(false);

    const lower = new StringSchema().lowercase();
    expect(lower.parse('hello').data).toBe('hello');
    expect(lower.parse('Hello').ok).toBe(false);
  });

  it('.trim() trims whitespace before validation', () => {
    const schema = new StringSchema().trim().min(3);
    expect(schema.parse('  hello  ').data).toBe('hello');
    expect(schema.parse('  ab  ').ok).toBe(false);
  });

  it('.toLowerCase(), .toUpperCase(), .normalize() transform the value', () => {
    expect(new StringSchema().toLowerCase().parse('HELLO').data).toBe('hello');
    expect(new StringSchema().toUpperCase().parse('hello').data).toBe('HELLO');
    expect(new StringSchema().normalize().parse('\u00e9').data).toBe('\u00e9');
    expect(new StringSchema().normalize().parse('e\u0301').data).toBe('\u00e9');
  });

  it('supports per-rule custom error messages', () => {
    const schema = new StringSchema().min(5, 'Too short').max(10, 'Too long');
    const minResult = schema.safeParse('ab');
    expect(minResult.ok).toBe(false);
    if (!minResult.ok) {
      expect(minResult.error.issues[0]?.message).toBe('Too short');
    }
    const maxResult = schema.safeParse('a]'.repeat(6));
    expect(maxResult.ok).toBe(false);
    if (!maxResult.ok) {
      expect(maxResult.error.issues[0]?.message).toBe('Too long');
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
