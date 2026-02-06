import { describe, it, expect } from 'vitest';
import { IntersectionSchema } from '../intersection';
import { ObjectSchema } from '../object';
import { StringSchema } from '../string';
import { NumberSchema } from '../number';
import { ErrorCode } from '../../core/errors';

describe('IntersectionSchema', () => {
  it('accepts values satisfying both schemas', () => {
    const left = new ObjectSchema({ name: new StringSchema() });
    const right = new ObjectSchema({ age: new NumberSchema() });
    const schema = new IntersectionSchema(left, right);
    expect(schema.parse({ name: 'Alice', age: 30 })).toEqual({ name: 'Alice', age: 30 });
  });

  it('rejects values failing either schema with InvalidIntersection', () => {
    const left = new ObjectSchema({ name: new StringSchema() });
    const right = new ObjectSchema({ age: new NumberSchema() });
    const schema = new IntersectionSchema(left, right);
    const result = schema.safeParse({ name: 'Alice' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.code).toBe(ErrorCode.InvalidIntersection);
    }
  });

  it('.toJSONSchema() returns { allOf: [left, right] }', () => {
    const left = new ObjectSchema({ name: new StringSchema() });
    const right = new ObjectSchema({ age: new NumberSchema() });
    const schema = new IntersectionSchema(left, right);
    expect(schema.toJSONSchema()).toEqual({
      allOf: [
        { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        { type: 'object', properties: { age: { type: 'number' } }, required: ['age'] },
      ],
    });
  });
});
