import { describe, expect, it } from '@vertz/test';
import { ErrorCode } from '../../core/errors';
import { SchemaType } from '../../core/types';
import { IntersectionSchema } from '../intersection';
import { NumberSchema } from '../number';
import { ObjectSchema } from '../object';
import { StringSchema } from '../string';

describe('IntersectionSchema', () => {
  it('accepts values satisfying both schemas', () => {
    const left = new ObjectSchema({ name: new StringSchema() });
    const right = new ObjectSchema({ age: new NumberSchema() });
    const schema = new IntersectionSchema(left, right);
    expect(schema.parse({ name: 'Alice', age: 30 }).data).toEqual({ name: 'Alice', age: 30 });
  });

  it('rejects values failing either schema with InvalidIntersection', () => {
    const left = new ObjectSchema({ name: new StringSchema() });
    const right = new ObjectSchema({ age: new NumberSchema() });
    const schema = new IntersectionSchema(left, right);
    const result = schema.safeParse({ name: 'Alice' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.InvalidIntersection);
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

  it('metadata.type returns SchemaType.Intersection', () => {
    const left = new ObjectSchema({ name: new StringSchema() });
    const right = new ObjectSchema({ age: new NumberSchema() });
    expect(new IntersectionSchema(left, right).metadata.type).toBe(SchemaType.Intersection);
  });

  it('_clone() preserves metadata', () => {
    const left = new ObjectSchema({ name: new StringSchema() });
    const right = new ObjectSchema({ age: new NumberSchema() });
    const schema = new IntersectionSchema(left, right).describe('name+age');
    expect(schema.metadata.description).toBe('name+age');
    expect(schema.parse({ name: 'Alice', age: 30 }).data).toEqual({ name: 'Alice', age: 30 });
  });
});
