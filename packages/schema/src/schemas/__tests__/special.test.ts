import { describe, expect, it } from 'bun:test';
import { ParseError } from '../../core/errors';
import {
  AnySchema,
  NeverSchema,
  NullSchema,
  UndefinedSchema,
  UnknownSchema,
  VoidSchema,
} from '../special';

describe('Special schemas', () => {
  it('AnySchema accepts everything', () => {
    const schema = new AnySchema();
    for (const value of [42, 'hello', true, null, undefined, {}, [], NaN]) {
      expect(schema.parse(value)).toBe(value);
    }
  });

  it('UnknownSchema accepts everything', () => {
    const schema = new UnknownSchema();
    for (const value of [42, 'hello', true, null, undefined, {}, []]) {
      expect(schema.parse(value)).toBe(value);
    }
  });

  it('NullSchema accepts null, rejects everything else', () => {
    const schema = new NullSchema();
    expect(schema.parse(null)).toBe(null);
    for (const value of [0, '', false, undefined, {}]) {
      expect(schema.safeParse(value).success).toBe(false);
    }
  });

  it('UndefinedSchema accepts undefined, rejects everything else', () => {
    const schema = new UndefinedSchema();
    expect(schema.parse(undefined)).toBe(undefined);
    for (const value of [0, '', false, null, {}]) {
      expect(schema.safeParse(value).success).toBe(false);
    }
  });

  it('VoidSchema accepts undefined, rejects everything else', () => {
    const schema = new VoidSchema();
    expect(schema.parse(undefined)).toBe(undefined);
    for (const value of [0, '', false, null, {}]) {
      expect(schema.safeParse(value).success).toBe(false);
    }
  });

  it('.toJSONSchema() returns correct JSON Schema for each special schema', () => {
    expect(new AnySchema().toJSONSchema()).toEqual({});
    expect(new UnknownSchema().toJSONSchema()).toEqual({});
    expect(new NullSchema().toJSONSchema()).toEqual({ type: 'null' });
    expect(new UndefinedSchema().toJSONSchema()).toEqual({});
    expect(new VoidSchema().toJSONSchema()).toEqual({});
    expect(new NeverSchema().toJSONSchema()).toEqual({ not: {} });
  });

  it('NeverSchema rejects everything', () => {
    const schema = new NeverSchema();
    for (const value of [42, 'hello', true, null, undefined, {}, []]) {
      const result = schema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ParseError);
      }
    }
  });
});
