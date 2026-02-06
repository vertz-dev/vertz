import { describe, it, expect } from 'vitest';
import { StringSchema } from '../../schemas/string';
import { NumberSchema } from '../../schemas/number';
import { ObjectSchema } from '../../schemas/object';
import { NullableSchema, OptionalSchema, DefaultSchema } from '../../core/schema';
import { TupleSchema } from '../../schemas/tuple';
import { DiscriminatedUnionSchema } from '../../schemas/discriminated-union';
import { IntersectionSchema } from '../../schemas/intersection';
import { RecordSchema } from '../../schemas/record';
import { DateSchema } from '../../schemas/date';
import { LazySchema } from '../../schemas/lazy';
import { EmailSchema } from '../../schemas/formats/email';
import { UuidSchema } from '../../schemas/formats/uuid';
import { LiteralSchema } from '../../schemas/literal';

describe('OpenAPI v3.1 Output', () => {
  it('named primitive produces $ref + $defs', () => {
    const userId = new StringSchema().id('UserId');
    const jsonSchema = userId.toJSONSchema();
    expect(jsonSchema).toEqual({
      $defs: { UserId: { type: 'string' } },
      $ref: '#/$defs/UserId',
    });
  });

  it('named object produces $ref + $defs', () => {
    const userSchema = new ObjectSchema({
      name: new StringSchema(),
      age: new NumberSchema(),
    }).id('User');
    const jsonSchema = userSchema.toJSONSchema();
    expect(jsonSchema.$defs).toBeDefined();
    expect(jsonSchema.$defs!['User']).toBeDefined();
    expect(jsonSchema.$ref).toBe('#/$defs/User');
  });

  it('nested named schemas produce multiple $defs entries', () => {
    const addressSchema = new ObjectSchema({
      street: new StringSchema(),
    }).id('Address');
    const userSchema = new ObjectSchema({
      name: new StringSchema(),
      address: addressSchema,
    }).id('User');
    const jsonSchema = userSchema.toJSONSchema();
    expect(jsonSchema.$defs!['User']).toBeDefined();
    expect(jsonSchema.$defs!['Address']).toBeDefined();
  });

  it('recursive schema uses $ref without infinite recursion', () => {
    type TreeNode = { value: string; children: TreeNode | null };
    const treeSchema: ObjectSchema<TreeNode> = new ObjectSchema({
      value: new StringSchema(),
      children: new NullableSchema(new LazySchema(() => treeSchema)),
    }).id('TreeNode') as ObjectSchema<TreeNode>;
    const jsonSchema = treeSchema.toJSONSchema();
    expect(jsonSchema.$ref).toBe('#/$defs/TreeNode');
    expect(jsonSchema.$defs!['TreeNode']).toBeDefined();
  });

  it('object with required/optional properties', () => {
    const schema = new ObjectSchema({
      name: new StringSchema(),
      email: new OptionalSchema(new StringSchema()),
    });
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.required).toEqual(['name']);
    expect(jsonSchema.properties).toBeDefined();
  });

  it('nullable produces type array with null', () => {
    const schema = new NullableSchema(new StringSchema());
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema).toEqual({ type: ['string', 'null'] });
  });

  it('tuple produces prefixItems + items: false', () => {
    const schema = new TupleSchema([new StringSchema(), new NumberSchema()]);
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema.type).toBe('array');
    expect(jsonSchema.prefixItems).toEqual([{ type: 'string' }, { type: 'number' }]);
    expect(jsonSchema.items).toBe(false);
  });

  it('discriminated union produces oneOf with discriminator', () => {
    const catSchema = new ObjectSchema({ type: new LiteralSchema('cat'), meow: new StringSchema() });
    const dogSchema = new ObjectSchema({ type: new LiteralSchema('dog'), bark: new StringSchema() });
    const schema = new DiscriminatedUnionSchema('type', [catSchema, dogSchema]);
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema.oneOf).toBeDefined();
    expect(jsonSchema.discriminator).toEqual({ propertyName: 'type' });
  });

  it('intersection produces allOf', () => {
    const a = new ObjectSchema({ name: new StringSchema() });
    const b = new ObjectSchema({ age: new NumberSchema() });
    const schema = new IntersectionSchema(a, b);
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema.allOf).toBeDefined();
    expect(jsonSchema.allOf).toHaveLength(2);
  });

  it('strict object produces additionalProperties: false', () => {
    const schema = new ObjectSchema({ name: new StringSchema() }).strict();
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema.additionalProperties).toBe(false);
  });

  it('record produces additionalProperties', () => {
    const schema = new RecordSchema(new NumberSchema());
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema).toEqual({
      type: 'object',
      additionalProperties: { type: 'number' },
    });
  });

  it('date produces format: date-time', () => {
    const schema = new DateSchema();
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema).toEqual({ type: 'string', format: 'date-time' });
  });

  it('number with .gt() produces exclusiveMinimum', () => {
    const schema = new NumberSchema().gt(0);
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema.exclusiveMinimum).toBe(0);
  });

  it('number with .int() produces type: integer', () => {
    const schema = new NumberSchema().int();
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema.type).toBe('integer');
  });

  it('string formats have correct format keyword', () => {
    expect(new EmailSchema().toJSONSchema().format).toBe('email');
    expect(new UuidSchema().toJSONSchema().format).toBe('uuid');
  });

  it('description propagates to JSON Schema', () => {
    const schema = new StringSchema().describe('A user name');
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema.description).toBe('A user name');
  });

  it('examples propagate to JSON Schema', () => {
    const schema = new StringSchema().example('john').example('jane');
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema.examples).toEqual(['john', 'jane']);
  });

  it('default values propagate to JSON Schema', () => {
    const schema = new DefaultSchema(new StringSchema(), 'unknown');
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema.default).toBe('unknown');
  });
});
