import { describe, expect, it } from 'vitest';
import { ParseError } from '../../core/errors';
import { BooleanSchema } from '../boolean';

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
