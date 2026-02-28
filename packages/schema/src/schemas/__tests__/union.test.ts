import { describe, expect, it } from 'bun:test';
import { ErrorCode } from '../../core/errors';
import { NumberSchema } from '../number';
import { StringSchema } from '../string';
import { UnionSchema } from '../union';

describe('UnionSchema', () => {
  it('accepts value matching first option', () => {
    const schema = new UnionSchema([new StringSchema(), new NumberSchema()]);
    expect(schema.parse('hello').data).toBe('hello');
  });

  it('accepts value matching second option', () => {
    const schema = new UnionSchema([new StringSchema(), new NumberSchema()]);
    expect(schema.parse(42).data).toBe(42);
  });

  it('rejects value matching no option with InvalidUnion', () => {
    const schema = new UnionSchema([new StringSchema(), new NumberSchema()]);
    const result = schema.safeParse(true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
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
