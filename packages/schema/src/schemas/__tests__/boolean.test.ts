import { describe, expect, it } from '@vertz/test';
import { ParseError } from '../../core/errors';
import { SchemaType } from '../../core/types';
import { BooleanSchema } from '../boolean';

describe('BooleanSchema', () => {
  it('accepts true/false and rejects non-booleans', () => {
    const schema = new BooleanSchema();
    expect(schema.parse(true).data).toBe(true);
    expect(schema.parse(false).data).toBe(false);

    for (const value of [0, 1, 'true', null, undefined, {}, []]) {
      const result = schema.safeParse(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ParseError);
      }
    }
  });

  it('metadata.type returns SchemaType.Boolean', () => {
    expect(new BooleanSchema().metadata.type).toBe(SchemaType.Boolean);
  });

  it('_clone() preserves metadata', () => {
    const schema = new BooleanSchema().describe('bool field');
    expect(schema.metadata.description).toBe('bool field');
    expect(schema.parse(true).data).toBe(true);
  });
});
