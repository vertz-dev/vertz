import { describe, it, expect } from 'vitest';
import { s, schema } from '..';
import { StringSchema } from '../schemas/string';
import { NumberSchema } from '../schemas/number';
import { BooleanSchema } from '../schemas/boolean';
import { BigIntSchema } from '../schemas/bigint';
import { DateSchema } from '../schemas/date';
import { ObjectSchema } from '../schemas/object';
import { ArraySchema } from '../schemas/array';
import { EnumSchema } from '../schemas/enum';
import { LiteralSchema } from '../schemas/literal';
import { EmailSchema } from '../schemas/formats/email';
import { IsoDateSchema } from '../schemas/formats/iso';
import { CoercedStringSchema } from '../schemas/coerced';
import { ParseError, SchemaRegistry } from '..';

describe('Factory Object', () => {
  it('s.string() returns StringSchema', () => {
    expect(s.string()).toBeInstanceOf(StringSchema);
  });

  it('s.number() returns NumberSchema', () => {
    expect(s.number()).toBeInstanceOf(NumberSchema);
  });

  it('all factory methods return correct schema types', () => {
    expect(s.boolean()).toBeInstanceOf(BooleanSchema);
    expect(s.bigint()).toBeInstanceOf(BigIntSchema);
    expect(s.date()).toBeInstanceOf(DateSchema);
    expect(s.object({ name: s.string() })).toBeInstanceOf(ObjectSchema);
    expect(s.array(s.string())).toBeInstanceOf(ArraySchema);
    expect(s.enum(['a', 'b'])).toBeInstanceOf(EnumSchema);
    expect(s.literal('hello')).toBeInstanceOf(LiteralSchema);
  });

  it('s.int() returns NumberSchema with .int() applied', () => {
    const intSchema = s.int();
    expect(intSchema).toBeInstanceOf(NumberSchema);
    expect(intSchema.safeParse(1.5).success).toBe(false);
    expect(intSchema.parse(42)).toBe(42);
  });

  it('s.coerce.string() returns CoercedStringSchema', () => {
    const coerced = s.coerce.string();
    expect(coerced).toBeInstanceOf(CoercedStringSchema);
    expect(coerced.parse(42)).toBe('42');
  });

  it('s.email() returns EmailSchema', () => {
    expect(s.email()).toBeInstanceOf(EmailSchema);
  });

  it('s.iso.date() returns IsoDateSchema', () => {
    expect(s.iso.date()).toBeInstanceOf(IsoDateSchema);
  });

  it('schema and s are the same object', () => {
    expect(schema).toBe(s);
  });

  it('all type exports are accessible', () => {
    expect(ParseError).toBeDefined();
    expect(SchemaRegistry).toBeDefined();
  });
});
