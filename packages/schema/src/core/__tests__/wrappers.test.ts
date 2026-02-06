import { describe, it, expect } from 'vitest';
import { StringSchema } from '../../schemas/string';
import { OptionalSchema, NullableSchema, DefaultSchema } from '../schema';

describe('OptionalSchema', () => {
  it('accepts undefined and returns undefined', () => {
    const inner = new StringSchema();
    const schema = new OptionalSchema(inner);
    expect(schema.parse(undefined)).toBeUndefined();
  });

  it('passes through to inner schema for non-undefined values', () => {
    const inner = new StringSchema();
    const schema = new OptionalSchema(inner);
    expect(schema.parse('hello')).toBe('hello');
    expect(() => schema.parse(42)).toThrow();
  });

  it('unwrap() returns the inner schema', () => {
    const inner = new StringSchema();
    const schema = new OptionalSchema(inner);
    expect(schema.unwrap()).toBe(inner);
  });
});

describe('NullableSchema', () => {
  it('accepts null and returns null', () => {
    const inner = new StringSchema();
    const schema = new NullableSchema(inner);
    expect(schema.parse(null)).toBeNull();
  });

  it('passes through to inner schema for non-null values', () => {
    const inner = new StringSchema();
    const schema = new NullableSchema(inner);
    expect(schema.parse('hello')).toBe('hello');
    expect(() => schema.parse(42)).toThrow();
  });

  it('toJSONSchema() produces type: ["string", "null"] for string inner', () => {
    const inner = new StringSchema();
    const schema = new NullableSchema(inner);
    expect(schema.toJSONSchema()).toEqual({ type: ['string', 'null'] });
  });
});

describe('DefaultSchema', () => {
  it('uses default value when input is undefined', () => {
    const inner = new StringSchema();
    const schema = new DefaultSchema(inner, 'fallback');
    expect(schema.parse(undefined)).toBe('fallback');
  });

  it('passes through for non-undefined values', () => {
    const inner = new StringSchema();
    const schema = new DefaultSchema(inner, 'fallback');
    expect(schema.parse('hello')).toBe('hello');
    expect(() => schema.parse(42)).toThrow();
  });

  it('calls function default each time when input is undefined', () => {
    let counter = 0;
    const inner = new StringSchema();
    const schema = new DefaultSchema(inner, () => `value-${++counter}`);
    expect(schema.parse(undefined)).toBe('value-1');
    expect(schema.parse(undefined)).toBe('value-2');
    expect(schema.parse(undefined)).toBe('value-3');
  });

  it('toJSONSchema() includes default property', () => {
    const inner = new StringSchema();
    const schema = new DefaultSchema(inner, 'fallback');
    expect(schema.toJSONSchema()).toEqual({ type: 'string', default: 'fallback' });
  });
});

describe('Wrapper chaining', () => {
  it('s.string().optional().nullable() stacks wrappers correctly', () => {
    const schema = new StringSchema().optional().nullable();
    expect(schema.parse(null)).toBeNull();
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse('hello')).toBe('hello');
  });

  it('inner refinements still execute through wrapper', () => {
    const inner = new StringSchema().min(3);
    const schema = inner.optional();
    // undefined should pass through without inner validation
    expect(schema.parse(undefined)).toBeUndefined();
    // valid string passes inner refinements
    expect(schema.parse('hello')).toBe('hello');
    // short string fails inner min(3) refinement
    expect(() => schema.parse('hi')).toThrow();
  });
});
