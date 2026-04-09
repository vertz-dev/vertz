import { describe, expect, it } from '@vertz/test';
import { ParseError } from '../../core/errors';
import { SchemaType } from '../../core/types';
import { BigIntSchema } from '../bigint';

describe('BigIntSchema', () => {
  it('accepts bigint values, rejects non-bigint, and toJSONSchema returns integer/int64', () => {
    const schema = new BigIntSchema();
    expect(schema.parse(42n).data).toBe(42n);
    expect(schema.parse(0n).data).toBe(0n);

    for (const value of [42, 'hello', true, null, undefined]) {
      const result = schema.safeParse(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ParseError);
      }
    }

    expect(schema.toJSONSchema()).toEqual({ type: 'integer', format: 'int64' });
  });

  it('metadata.type returns SchemaType.BigInt', () => {
    expect(new BigIntSchema().metadata.type).toBe(SchemaType.BigInt);
  });

  it('_clone() preserves metadata', () => {
    const schema = new BigIntSchema().describe('bigint field');
    expect(schema.metadata.description).toBe('bigint field');
    expect(schema.parse(1n).data).toBe(1n);
  });
});
