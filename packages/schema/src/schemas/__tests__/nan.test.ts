import { describe, expect, it } from '@vertz/test';
import { ParseError } from '../../core/errors';
import { SchemaType } from '../../core/types';
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

  it('metadata.type returns SchemaType.NaN', () => {
    expect(new NanSchema().metadata.type).toBe(SchemaType.NaN);
  });

  it('_clone() preserves metadata', () => {
    const schema = new NanSchema().describe('nan field');
    expect(schema.metadata.description).toBe('nan field');
    expect(Number.isNaN(schema.parse(NaN).data)).toBe(true);
  });
});
