import { describe, it, expect } from 'vitest';
import { BooleanSchema } from '../boolean';
import { ParseError } from '../../core/errors';

describe('BooleanSchema', () => {
  it('accepts true/false and rejects non-booleans', () => {
    const schema = new BooleanSchema();
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(false)).toBe(false);

    for (const value of [0, 1, 'true', null, undefined, {}, []]) {
      const result = schema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ParseError);
      }
    }
  });
});
