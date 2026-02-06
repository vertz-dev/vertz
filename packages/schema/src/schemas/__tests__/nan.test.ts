import { describe, it, expect } from 'vitest';
import { NanSchema } from '../nan';
import { ParseError } from '../../core/errors';

describe('NanSchema', () => {
  it('accepts NaN, rejects numbers and non-numbers', () => {
    const schema = new NanSchema();
    expect(Number.isNaN(schema.parse(NaN))).toBe(true);

    for (const value of [0, 42, 'hello', true, null, undefined]) {
      const result = schema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ParseError);
      }
    }
  });
});
