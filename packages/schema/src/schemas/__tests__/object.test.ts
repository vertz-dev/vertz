import { describe, it, expect, beforeEach } from 'vitest';
import { ObjectSchema } from '../object';
import { StringSchema } from '../string';
import { NumberSchema } from '../number';
import { ParseError, ErrorCode } from '../../core/errors';
import { SchemaRegistry } from '../../core/registry';

describe('ObjectSchema', () => {
  beforeEach(() => {
    SchemaRegistry.clear();
  });

  it('accepts a valid object matching shape', () => {
    const schema = new ObjectSchema({ name: new StringSchema(), age: new NumberSchema() });
    expect(schema.parse({ name: 'Alice', age: 30 })).toEqual({ name: 'Alice', age: 30 });
  });

  it('rejects non-object values (null, array, primitive)', () => {
    const schema = new ObjectSchema({ name: new StringSchema() });
    for (const value of [null, [1, 2], 'hello', 42, true, undefined]) {
      const result = schema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ParseError);
        expect(result.error.issues[0]!.code).toBe(ErrorCode.InvalidType);
      }
    }
  });

  it('reports missing required properties with MissingProperty error code', () => {
    const schema = new ObjectSchema({ name: new StringSchema(), age: new NumberSchema() });
    const result = schema.safeParse({ name: 'Alice' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const missingIssue = result.error.issues.find((i) => i.code === ErrorCode.MissingProperty);
      expect(missingIssue).toBeDefined();
      expect(missingIssue!.path).toEqual(['age']);
    }
  });

  it('allows optional properties to be absent', () => {
    const schema = new ObjectSchema({
      name: new StringSchema(),
      nickname: new StringSchema().optional(),
    });
    const result = schema.parse({ name: 'Alice' });
    expect(result).toEqual({ name: 'Alice', nickname: undefined });
  });

  it('fills in default properties when absent', () => {
    const schema = new ObjectSchema({
      name: new StringSchema(),
      role: new StringSchema().default('user'),
    });
    const result = schema.parse({ name: 'Alice' });
    expect(result).toEqual({ name: 'Alice', role: 'user' });
  });

  it('strips unknown keys by default', () => {
    const schema = new ObjectSchema({ name: new StringSchema() });
    const result = schema.parse({ name: 'Alice', extra: 'ignored', another: 42 });
    expect(result).toEqual({ name: 'Alice' });
    expect(result).not.toHaveProperty('extra');
    expect(result).not.toHaveProperty('another');
  });

  it('.strict() rejects unknown keys with UnrecognizedKeys error', () => {
    const schema = new ObjectSchema({ name: new StringSchema() }).strict();
    const result = schema.safeParse({ name: 'Alice', extra: 'bad' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.code === ErrorCode.UnrecognizedKeys);
      expect(issue).toBeDefined();
      expect(issue!.message).toContain('extra');
    }
  });

  it('.passthrough() preserves unknown keys in output', () => {
    const schema = new ObjectSchema({ name: new StringSchema() }).passthrough();
    const result = schema.parse({ name: 'Alice', extra: 'kept', another: 42 });
    expect(result).toEqual({ name: 'Alice', extra: 'kept', another: 42 });
  });

  it('.catchall(schema) validates unknown keys against the catchall schema', () => {
    const schema = new ObjectSchema({ name: new StringSchema() }).catchall(new NumberSchema());
    expect(schema.parse({ name: 'Alice', score: 100 })).toEqual({ name: 'Alice', score: 100 });
    const result = schema.safeParse({ name: 'Alice', score: 'not-a-number' });
    expect(result.success).toBe(false);
  });

  it('.shape returns the shape definition', () => {
    const nameSchema = new StringSchema();
    const ageSchema = new NumberSchema();
    const schema = new ObjectSchema({ name: nameSchema, age: ageSchema });
    expect(schema.shape).toEqual({ name: nameSchema, age: ageSchema });
  });

  it('.keyof() returns array of shape keys', () => {
    const schema = new ObjectSchema({ name: new StringSchema(), age: new NumberSchema() });
    expect(schema.keyof()).toEqual(['name', 'age']);
  });

  it('.extend(shape) adds new properties', () => {
    const base = new ObjectSchema({ name: new StringSchema() });
    const extended = base.extend({ age: new NumberSchema() });
    expect(extended.parse({ name: 'Alice', age: 30 })).toEqual({ name: 'Alice', age: 30 });
    expect(extended.keyof()).toEqual(['name', 'age']);
  });

  it('.merge(otherObject) combines two object schemas, later shape wins on conflict', () => {
    const a = new ObjectSchema({ name: new StringSchema(), age: new NumberSchema() });
    const b = new ObjectSchema({ age: new StringSchema(), email: new StringSchema() });
    const merged = a.merge(b);
    expect(merged.parse({ name: 'Alice', age: '30', email: 'a@b.com' })).toEqual({
      name: 'Alice',
      age: '30',
      email: 'a@b.com',
    });
    // age is now StringSchema from b, so number should fail
    const result = merged.safeParse({ name: 'Alice', age: 30, email: 'a@b.com' });
    expect(result.success).toBe(false);
  });

  it('.pick(keys) keeps only specified keys', () => {
    const schema = new ObjectSchema({
      name: new StringSchema(),
      age: new NumberSchema(),
      email: new StringSchema(),
    });
    const picked = schema.pick('name', 'email');
    expect(picked.parse({ name: 'Alice', email: 'a@b.com' })).toEqual({
      name: 'Alice',
      email: 'a@b.com',
    });
    expect(picked.keyof()).toEqual(['name', 'email']);
  });

  it('.omit(keys) removes specified keys', () => {
    const schema = new ObjectSchema({
      name: new StringSchema(),
      age: new NumberSchema(),
      email: new StringSchema(),
    });
    const omitted = schema.omit('age');
    expect(omitted.parse({ name: 'Alice', email: 'a@b.com' })).toEqual({
      name: 'Alice',
      email: 'a@b.com',
    });
    expect(omitted.keyof()).toEqual(['name', 'email']);
  });

  it('.partial() makes all properties optional', () => {
    const schema = new ObjectSchema({ name: new StringSchema(), age: new NumberSchema() });
    const partial = schema.partial();
    expect(partial.parse({})).toEqual({ name: undefined, age: undefined });
    expect(partial.parse({ name: 'Alice' })).toEqual({ name: 'Alice', age: undefined });
  });

  it('.required() unwraps OptionalSchema wrappers', () => {
    const schema = new ObjectSchema({
      name: new StringSchema().optional(),
      age: new NumberSchema().optional(),
    });
    const required = schema.required();
    const result = required.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBe(2);
      expect(result.error.issues.every((i) => i.code === ErrorCode.MissingProperty)).toBe(true);
    }
    expect(required.parse({ name: 'Alice', age: 30 })).toEqual({ name: 'Alice', age: 30 });
  });

  it('.required() also unwraps DefaultSchema wrappers', () => {
    const schema = new ObjectSchema({
      name: new StringSchema(),
      role: new StringSchema().default('user'),
    });
    const required = schema.required();
    // After .required(), 'role' should no longer have a default — missing = error
    const result = required.safeParse({ name: 'Alice' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.code === ErrorCode.MissingProperty);
      expect(issue).toBeDefined();
      expect(issue!.path).toEqual(['role']);
    }
  });

  it('.catchall() overrides .strict() when chained', () => {
    const schema = new ObjectSchema({ name: new StringSchema() })
      .strict()
      .catchall(new NumberSchema());
    // catchall should take precedence — validates unknown keys instead of rejecting
    expect(schema.parse({ name: 'Alice', score: 100 })).toEqual({ name: 'Alice', score: 100 });
  });

  it('.toJSONSchema() returns type, properties, and required array', () => {
    const schema = new ObjectSchema({
      name: new StringSchema(),
      age: new NumberSchema(),
      nickname: new StringSchema().optional(),
    });
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
        nickname: { type: 'string' },
      },
      required: ['name', 'age'],
    });
  });

  it('.strict().toJSONSchema() includes additionalProperties: false', () => {
    const schema = new ObjectSchema({ name: new StringSchema() }).strict();
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    });
  });

  it('.catchall().toJSONSchema() includes additionalProperties with catchall schema', () => {
    const schema = new ObjectSchema({ name: new StringSchema() }).catchall(new NumberSchema());
    const jsonSchema = schema.toJSONSchema();
    expect(jsonSchema).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: { type: 'number' },
    });
  });

  it('nested object validation includes full error path', () => {
    const schema = new ObjectSchema({
      user: new ObjectSchema({
        name: new StringSchema(),
        address: new ObjectSchema({
          city: new StringSchema(),
        }),
      }),
    });
    const result = schema.safeParse({ user: { name: 'Alice', address: { city: 42 } } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.path).toEqual(['user', 'address', 'city']);
    }
  });

  it('named schemas in shape produce $ref in JSON Schema', () => {
    const Address = new ObjectSchema({
      street: new StringSchema(),
      city: new StringSchema(),
    }).id('Address');
    const User = new ObjectSchema({
      name: new StringSchema(),
      address: Address,
    });
    const jsonSchema = User.toJSONSchema();
    expect(jsonSchema).toEqual({
      $defs: {
        Address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
          },
          required: ['street', 'city'],
        },
      },
      type: 'object',
      properties: {
        name: { type: 'string' },
        address: { $ref: '#/$defs/Address' },
      },
      required: ['name', 'address'],
    });
  });
});
