import { describe, expect, it } from 'bun:test';
import { ErrorCode } from '../../core/errors';
import { BooleanSchema } from '../boolean';
import { NumberSchema } from '../number';
import { StringSchema } from '../string';
import { TupleSchema } from '../tuple';

describe('TupleSchema', () => {
  it('accepts a tuple with correct types at each position', () => {
    const schema = new TupleSchema([new StringSchema(), new NumberSchema(), new BooleanSchema()]);
    expect(schema.parse(['hello', 42, true]).data).toEqual(['hello', 42, true]);
  });

  it('rejects wrong type at any position with error path', () => {
    const schema = new TupleSchema([new StringSchema(), new NumberSchema()]);
    const result = schema.safeParse(['hello', 'not-a-number']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.path).toEqual([1]);
    }
  });

  it('rejects wrong length', () => {
    const schema = new TupleSchema([new StringSchema(), new NumberSchema()]);
    expect(schema.safeParse(['a']).ok).toBe(false);
    expect(schema.safeParse(['a', 1, true]).ok).toBe(false);
  });

  it('.rest(schema) validates additional elements', () => {
    const schema = new TupleSchema([new StringSchema()]).rest(new NumberSchema());
    expect(schema.parse(['hello', 1, 2, 3]).data).toEqual(['hello', 1, 2, 3]);
    const result = schema.safeParse(['hello', 1, 'bad']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.path).toEqual([2]);
    }
  });

  it('.toJSONSchema() returns prefixItems and items: false', () => {
    const schema = new TupleSchema([new StringSchema(), new NumberSchema()]);
    expect(schema.toJSONSchema()).toEqual({
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
      items: false,
    });
  });

  it('.rest().toJSONSchema() returns prefixItems and items with rest schema', () => {
    const schema = new TupleSchema([new StringSchema()]).rest(new BooleanSchema());
    expect(schema.toJSONSchema()).toEqual({
      type: 'array',
      prefixItems: [{ type: 'string' }],
      items: { type: 'boolean' },
    });
  });

  it('rejects non-array values', () => {
    const schema = new TupleSchema([new StringSchema()]);
    const result = schema.safeParse('not-an-array');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.InvalidType);
    }
  });
});
