import { beforeEach, describe, expect, it } from 'vitest';
import type { RefTracker } from '../../introspection/json-schema';
import { ErrorCode, ParseError } from '../errors';
import type { ParseContext } from '../parse-context';
import { SchemaRegistry } from '../registry';
import { Schema } from '../schema';
import { SchemaType } from '../types';

/** Minimal concrete schema for testing the abstract base */
class TestStringSchema extends Schema<string> {
  _parse(value: unknown, ctx: ParseContext): string {
    if (typeof value !== 'string') {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected string' });
      return value as string;
    }
    return value;
  }

  _schemaType(): SchemaType {
    return SchemaType.String;
  }

  _toJSONSchema(_tracker: RefTracker): Record<string, unknown> {
    return { type: 'string' };
  }

  _clone(): TestStringSchema {
    return this._cloneBase(new TestStringSchema());
  }
}

describe('Schema base class', () => {
  beforeEach(() => {
    SchemaRegistry.clear();
  });

  it('parse() returns the validated value on success', () => {
    const schema = new TestStringSchema();
    expect(schema.parse('hello')).toBe('hello');
  });

  it('parse() throws ParseError on invalid input', () => {
    const schema = new TestStringSchema();
    expect(() => schema.parse(42)).toThrow(ParseError);
  });

  it('safeParse() returns success on valid input and error on invalid', () => {
    const schema = new TestStringSchema();

    const success = schema.safeParse('hello');
    expect(success).toEqual({ success: true, data: 'hello' });

    const failure = schema.safeParse(42);
    expect(failure.success).toBe(false);
    if (!failure.success) {
      expect(failure.error).toBeInstanceOf(ParseError);
      expect(failure.error.issues[0]?.code).toBe(ErrorCode.InvalidType);
    }
  });

  it('describe() sets description and returns a new instance', () => {
    const schema = new TestStringSchema();
    const described = schema.describe('A name field');

    expect(described.metadata.description).toBe('A name field');
    // Original is unmodified (immutable chaining)
    expect(schema.metadata.description).toBeUndefined();
  });

  it('meta() merges metadata and example() accumulates examples', () => {
    const schema = new TestStringSchema();
    const withMeta = schema.meta({ deprecated: true }).example('hello').example('world');

    expect(withMeta.metadata.meta).toEqual({ deprecated: true });
    expect(withMeta.metadata.examples).toEqual(['hello', 'world']);
    // Original is unmodified
    expect(schema.metadata.meta).toBeUndefined();
    expect(schema.metadata.examples).toEqual([]);
  });

  it('id() sets name and registers with SchemaRegistry', () => {
    const schema = new TestStringSchema();
    const named = schema.id('UserName');

    expect(named.metadata.id).toBe('UserName');
    expect(SchemaRegistry.has('UserName')).toBe(true);
    expect(SchemaRegistry.get('UserName')).toBe(named);
  });

  it('toJSONSchema() returns the JSON schema for an unnamed schema', () => {
    const schema = new TestStringSchema();
    expect(schema.toJSONSchema()).toEqual({ type: 'string' });
  });

  it('toJSONSchema() uses $ref/$defs for named schemas', () => {
    const schema = new TestStringSchema().id('UserName');
    const jsonSchema = schema.toJSONSchema();

    expect(jsonSchema).toEqual({
      $defs: { UserName: { type: 'string' } },
      $ref: '#/$defs/UserName',
    });
  });
});
