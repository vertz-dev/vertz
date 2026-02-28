import { describe, expect, it } from 'bun:test';
import { ParseError } from '../../core/errors';
import { NanSchema } from '../nan';

describe('NanSchema', () => {
  it('accepts NaN, rejects numbers and non-numbers', () => {
    const schema = new NanSchema();
    expect(Number.isNaN(schema.parse(NaN).data)).toBe(true);

    for (const value of [0, 42, 'hello', true, null, undefined]) {
      const result = schema.safeParse(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ParseError);
      }
    }
  });

  it('.toJSONSchema() returns { not: {} } since NaN is not representable in JSON Schema', () => {
    const schema = new NanSchema();
    expect(schema.toJSONSchema()).toEqual({ not: {} });
  });
});
