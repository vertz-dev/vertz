import { describe, it, expect } from 'vitest';
import { RecordSchema } from '../record';
import { StringSchema } from '../string';
import { NumberSchema } from '../number';
import { ErrorCode } from '../../core/errors';

describe('RecordSchema', () => {
  it('accepts valid record with string keys and typed values', () => {
    const schema = new RecordSchema(new NumberSchema());
    expect(schema.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('validates both keys and values with two-arg constructor', () => {
    const schema = new RecordSchema(new StringSchema().min(2), new NumberSchema());
    expect(schema.parse({ ab: 1, cd: 2 })).toEqual({ ab: 1, cd: 2 });
    const result = schema.safeParse({ x: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid values with path', () => {
    const schema = new RecordSchema(new NumberSchema());
    const result = schema.safeParse({ a: 1, b: 'bad' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['b']);
    }
  });

  it('rejects non-object values', () => {
    const schema = new RecordSchema(new NumberSchema());
    const result = schema.safeParse('not-object');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.InvalidType);
    }
  });

  it('.toJSONSchema() returns { type: "object", additionalProperties: { ... } }', () => {
    const schema = new RecordSchema(new NumberSchema());
    expect(schema.toJSONSchema()).toEqual({
      type: 'object',
      additionalProperties: { type: 'number' },
    });
  });
});
