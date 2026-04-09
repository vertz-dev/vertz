import { describe, expect, it } from '@vertz/test';
import { ParseError } from '../../core/errors';
import { SchemaType } from '../../core/types';
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
      expect(schema.parse(value).data).toBe(value);
    }
  });

  it('UnknownSchema accepts everything', () => {
    const schema = new UnknownSchema();
    for (const value of [42, 'hello', true, null, undefined, {}, []]) {
      expect(schema.parse(value).data).toBe(value);
    }
  });

  it('NullSchema accepts null, rejects everything else', () => {
    const schema = new NullSchema();
    expect(schema.parse(null).data).toBe(null);
    for (const value of [0, '', false, undefined, {}]) {
      expect(schema.safeParse(value).ok).toBe(false);
    }
  });

  it('UndefinedSchema accepts undefined, rejects everything else', () => {
    const schema = new UndefinedSchema();
    expect(schema.parse(undefined).data).toBe(undefined);
    for (const value of [0, '', false, null, {}]) {
      expect(schema.safeParse(value).ok).toBe(false);
    }
  });

  it('VoidSchema accepts undefined, rejects everything else', () => {
    const schema = new VoidSchema();
    expect(schema.parse(undefined).data).toBe(undefined);
    for (const value of [0, '', false, null, {}]) {
      expect(schema.safeParse(value).ok).toBe(false);
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
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ParseError);
      }
    }
  });

  it('metadata.type returns correct SchemaType for each special schema', () => {
    expect(new AnySchema().metadata.type).toBe(SchemaType.Any);
    expect(new UnknownSchema().metadata.type).toBe(SchemaType.Unknown);
    expect(new NullSchema().metadata.type).toBe(SchemaType.Null);
    expect(new UndefinedSchema().metadata.type).toBe(SchemaType.Undefined);
    expect(new VoidSchema().metadata.type).toBe(SchemaType.Void);
    expect(new NeverSchema().metadata.type).toBe(SchemaType.Never);
  });

  it('_clone() preserves metadata for each special schema', () => {
    expect(new AnySchema().describe('any desc').metadata.description).toBe('any desc');
    expect(new UnknownSchema().describe('unknown desc').metadata.description).toBe('unknown desc');
    expect(new NullSchema().describe('null desc').metadata.description).toBe('null desc');
    expect(new UndefinedSchema().describe('undef desc').metadata.description).toBe('undef desc');
    expect(new VoidSchema().describe('void desc').metadata.description).toBe('void desc');
    expect(new NeverSchema().describe('never desc').metadata.description).toBe('never desc');
  });
});
