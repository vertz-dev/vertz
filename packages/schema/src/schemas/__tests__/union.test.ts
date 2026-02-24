import { describe, expect, it } from 'bun:test';
import { ErrorCode } from '../../core/errors';
import { NumberSchema } from '../number';
import { StringSchema } from '../string';
import { UnionSchema } from '../union';

describe('UnionSchema', () => {
  it('accepts value matching first option', () => {
    const schema = new UnionSchema([new StringSchema(), new NumberSchema()]);
    expect(schema.parse('hello')).toBe('hello');
  });

  it('accepts value matching second option', () => {
    const schema = new UnionSchema([new StringSchema(), new NumberSchema()]);
    expect(schema.parse(42)).toBe(42);
  });

  it('rejects value matching no option with InvalidUnion', () => {
    const schema = new UnionSchema([new StringSchema(), new NumberSchema()]);
    const result = schema.safeParse(true);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.InvalidUnion);
    }
  });

  it('.toJSONSchema() returns { anyOf: [...] }', () => {
    const schema = new UnionSchema([new StringSchema(), new NumberSchema()]);
    expect(schema.toJSONSchema()).toEqual({
      anyOf: [{ type: 'string' }, { type: 'number' }],
    });
  });
});
