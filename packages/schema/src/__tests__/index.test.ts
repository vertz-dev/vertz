import { describe, expect, it } from '@vertz/test';
import {
  CustomSchema,
  DiscriminatedUnionSchema,
  FileSchema,
  InstanceOfSchema,
  IntersectionSchema,
  LazySchema,
  MapSchema,
  NanSchema,
  ParseError,
  RecordSchema,
  SchemaRegistry,
  SetSchema,
  s,
  schema,
  TupleSchema,
  UnionSchema,
} from '..';
import { ArraySchema } from '../schemas/array';
import { BigIntSchema } from '../schemas/bigint';
import { BooleanSchema } from '../schemas/boolean';
import {
  CoercedBigIntSchema,
  CoercedBooleanSchema,
  CoercedDateSchema,
  CoercedNumberSchema,
  CoercedStringSchema,
} from '../schemas/coerced';
import { DateSchema } from '../schemas/date';
import { EnumSchema } from '../schemas/enum';
import {
  Base64Schema,
  CuidSchema,
  EmailSchema,
  HexSchema,
  HostnameSchema,
  Ipv4Schema,
  Ipv6Schema,
  IsoDateSchema,
  IsoDatetimeSchema,
  IsoDurationSchema,
  IsoTimeSchema,
  JwtSchema,
  NanoidSchema,
  UlidSchema,
  UrlSchema,
  UuidSchema,
} from '../schemas/formats';
import { LiteralSchema } from '../schemas/literal';
import { NumberSchema } from '../schemas/number';
import { ObjectSchema } from '../schemas/object';
import {
  AnySchema,
  NeverSchema,
  NullSchema,
  UndefinedSchema,
  UnknownSchema,
  VoidSchema,
} from '../schemas/special';
import { StringSchema } from '../schemas/string';
import { SymbolSchema } from '../schemas/symbol';

describe('Factory Object', () => {
  it('s.string() returns StringSchema', () => {
    expect(s.string()).toBeInstanceOf(StringSchema);
  });

  it('s.number() returns NumberSchema', () => {
    expect(s.number()).toBeInstanceOf(NumberSchema);
  });

  it('primitive factory methods return correct types', () => {
    expect(s.boolean()).toBeInstanceOf(BooleanSchema);
    expect(s.bigint()).toBeInstanceOf(BigIntSchema);
    expect(s.date()).toBeInstanceOf(DateSchema);
    expect(s.symbol()).toBeInstanceOf(SymbolSchema);
    expect(s.nan()).toBeInstanceOf(NanSchema);
  });

  it('special factory methods return correct types', () => {
    expect(s.any()).toBeInstanceOf(AnySchema);
    expect(s.unknown()).toBeInstanceOf(UnknownSchema);
    expect(s.null()).toBeInstanceOf(NullSchema);
    expect(s.undefined()).toBeInstanceOf(UndefinedSchema);
    expect(s.void()).toBeInstanceOf(VoidSchema);
    expect(s.never()).toBeInstanceOf(NeverSchema);
  });

  it('composite factory methods return correct types', () => {
    expect(s.object({ name: s.string() })).toBeInstanceOf(ObjectSchema);
    expect(s.array(s.string())).toBeInstanceOf(ArraySchema);
    expect(s.enum(['a', 'b'])).toBeInstanceOf(EnumSchema);
    expect(s.literal('hello')).toBeInstanceOf(LiteralSchema);
    expect(s.record(s.number())).toBeInstanceOf(RecordSchema);
    expect(s.set(s.string())).toBeInstanceOf(SetSchema);
    expect(s.file()).toBeInstanceOf(FileSchema);
    expect(s.custom<number>((v) => typeof v === 'number')).toBeInstanceOf(CustomSchema);
    expect(s.instanceof(Date)).toBeInstanceOf(InstanceOfSchema);
    expect(s.lazy(() => s.string())).toBeInstanceOf(LazySchema);
  });

  it('s.tuple() returns TupleSchema', () => {
    const t = s.tuple([s.string(), s.number()]);
    expect(t).toBeInstanceOf(TupleSchema);
    expect(t.parse(['hello', 42]).data).toEqual(['hello', 42]);
  });

  it('s.union() returns UnionSchema', () => {
    const u = s.union([s.string(), s.number()]);
    expect(u).toBeInstanceOf(UnionSchema);
    expect(u.parse('hello').data).toBe('hello');
  });

  it('s.discriminatedUnion() returns DiscriminatedUnionSchema', () => {
    const du = s.discriminatedUnion('type', [
      s.object({ type: s.literal('a'), value: s.string() }),
      s.object({ type: s.literal('b'), count: s.number() }),
    ]);
    expect(du).toBeInstanceOf(DiscriminatedUnionSchema);
  });

  it('s.intersection() returns IntersectionSchema', () => {
    const ix = s.intersection(s.object({ a: s.string() }), s.object({ b: s.number() }));
    expect(ix).toBeInstanceOf(IntersectionSchema);
  });

  it('s.map() returns MapSchema', () => {
    const m = s.map(s.string(), s.number());
    expect(m).toBeInstanceOf(MapSchema);
    const input = new Map([['a', 1]]);
    expect(m.parse(input).data).toEqual(input);
  });

  it('s.int() returns NumberSchema with .int() applied', () => {
    const intSchema = s.int();
    expect(intSchema).toBeInstanceOf(NumberSchema);
    expect(intSchema.safeParse(1.5).ok).toBe(false);
    expect(intSchema.parse(42).data).toBe(42);
  });

  it('format factory methods return correct types', () => {
    expect(s.email()).toBeInstanceOf(EmailSchema);
    expect(s.uuid()).toBeInstanceOf(UuidSchema);
    expect(s.url()).toBeInstanceOf(UrlSchema);
    expect(s.hostname()).toBeInstanceOf(HostnameSchema);
    expect(s.ipv4()).toBeInstanceOf(Ipv4Schema);
    expect(s.ipv6()).toBeInstanceOf(Ipv6Schema);
    expect(s.base64()).toBeInstanceOf(Base64Schema);
    expect(s.hex()).toBeInstanceOf(HexSchema);
    expect(s.jwt()).toBeInstanceOf(JwtSchema);
    expect(s.cuid()).toBeInstanceOf(CuidSchema);
    expect(s.ulid()).toBeInstanceOf(UlidSchema);
    expect(s.nanoid()).toBeInstanceOf(NanoidSchema);
  });

  it('s.iso.* factory methods return correct types', () => {
    expect(s.iso.date()).toBeInstanceOf(IsoDateSchema);
    expect(s.iso.time()).toBeInstanceOf(IsoTimeSchema);
    expect(s.iso.datetime()).toBeInstanceOf(IsoDatetimeSchema);
    expect(s.iso.duration()).toBeInstanceOf(IsoDurationSchema);
  });

  it('s.fromDbEnum() creates EnumSchema from column metadata', () => {
    const col = { _meta: { enumValues: ['active', 'inactive'] as const } };
    const e = s.fromDbEnum(col);
    expect(e).toBeInstanceOf(EnumSchema);
    expect(e.parse('active').data).toBe('active');
  });

  it('s.coerce.* factory methods return correct types', () => {
    expect(s.coerce.string()).toBeInstanceOf(CoercedStringSchema);
    expect(s.coerce.number()).toBeInstanceOf(CoercedNumberSchema);
    expect(s.coerce.boolean()).toBeInstanceOf(CoercedBooleanSchema);
    expect(s.coerce.bigint()).toBeInstanceOf(CoercedBigIntSchema);
    expect(s.coerce.date()).toBeInstanceOf(CoercedDateSchema);
  });

  it('schema and s are the same object', () => {
    expect(schema).toBe(s);
  });

  it('all type exports are accessible', () => {
    expect(ParseError).toBeDefined();
    expect(SchemaRegistry).toBeDefined();
  });
});
