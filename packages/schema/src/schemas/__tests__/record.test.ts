import { describe, expect, it } from 'bun:test';
import { ErrorCode } from '../../core/errors';
import { NumberSchema } from '../number';
import { RecordSchema } from '../record';
import { StringSchema } from '../string';

describe('RecordSchema', () => {
  it('accepts valid record with string keys and typed values', () => {
    const schema = new RecordSchema(new NumberSchema());
    expect(schema.parse({ a: 1, b: 2 }).data).toEqual({ a: 1, b: 2 });
  });

  it('validates both keys and values with two-arg constructor', () => {
    const schema = new RecordSchema(new StringSchema().min(2), new NumberSchema());
    expect(schema.parse({ ab: 1, cd: 2 }).data).toEqual({ ab: 1, cd: 2 });
    const result = schema.safeParse({ x: 1 });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid values with path', () => {
    const schema = new RecordSchema(new NumberSchema());
    const result = schema.safeParse({ a: 1, b: 'bad' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.path).toEqual(['b']);
    }
  });

  it('rejects non-object values', () => {
    const schema = new RecordSchema(new NumberSchema());
    const result = schema.safeParse('not-object');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.InvalidType);
    }
  });

  it('strips __proto__ key to prevent prototype pollution', () => {
    const schema = new RecordSchema(new NumberSchema());
    const malicious = JSON.parse('{"a":1,"__proto__":{"polluted":true},"b":2}');
    const result = schema.parse(malicious);
    // __proto__ with object value pollutes the result's prototype chain.
    // The result should NOT inherit 'polluted' from a tampered prototype.
    expect((result.data as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(result.data)).toBe(Object.prototype);
    expect(result.data?.a).toBe(1);
    expect(result.data?.b).toBe(2);
  });

  it('keeps constructor and prototype as legitimate keys', () => {
    const schema = new RecordSchema(new NumberSchema());
    const input = { a: 1, constructor: 2, prototype: 3 };
    const result = schema.parse(input);
    expect(result.data).toEqual({ a: 1, constructor: 2, prototype: 3 });
  });

  it('.toJSONSchema() returns { type: "object", additionalProperties: { ... } }', () => {
    const schema = new RecordSchema(new NumberSchema());
    expect(schema.toJSONSchema()).toEqual({
      type: 'object',
      additionalProperties: { type: 'number' },
    });
  });
});
