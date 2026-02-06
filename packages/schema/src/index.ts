// @vertz/schema — Public API

// Core
export {
  Schema,
  OptionalSchema,
  NullableSchema,
  DefaultSchema,
  RefinedSchema,
  SuperRefinedSchema,
  TransformSchema,
  PipeSchema,
  CatchSchema,
  BrandedSchema,
  ReadonlySchema,
} from './core/schema';
export { ErrorCode, ParseError } from './core/errors';
export type { ValidationIssue } from './core/errors';
export { ParseContext } from './core/parse-context';
export type { RefinementContext } from './core/parse-context';
export { SchemaType } from './core/types';
export type { SchemaMetadata, SafeParseResult } from './core/types';
export { SchemaRegistry } from './core/registry';

// Introspection
export { RefTracker, toJSONSchema } from './introspection/json-schema';
export type { JSONSchemaObject } from './introspection/json-schema';

// Schemas
export { StringSchema } from './schemas/string';
export { NumberSchema } from './schemas/number';
export { BooleanSchema } from './schemas/boolean';
export { BigIntSchema } from './schemas/bigint';
export { DateSchema } from './schemas/date';
export { NanSchema } from './schemas/nan';
export { SymbolSchema } from './schemas/symbol';
export { AnySchema, UnknownSchema, NullSchema, UndefinedSchema, VoidSchema, NeverSchema } from './schemas/special';
export { ObjectSchema } from './schemas/object';
export { ArraySchema } from './schemas/array';
export { TupleSchema } from './schemas/tuple';
export { EnumSchema } from './schemas/enum';
export { LiteralSchema } from './schemas/literal';
export { UnionSchema } from './schemas/union';
export { DiscriminatedUnionSchema } from './schemas/discriminated-union';
export { IntersectionSchema } from './schemas/intersection';
export { RecordSchema } from './schemas/record';
export { MapSchema } from './schemas/map';
export { SetSchema } from './schemas/set';
export { FileSchema } from './schemas/file';
export { CustomSchema } from './schemas/custom';
export { InstanceOfSchema } from './schemas/instanceof';
export { LazySchema } from './schemas/lazy';
export {
  CoercedStringSchema,
  CoercedNumberSchema,
  CoercedBooleanSchema,
  CoercedBigIntSchema,
  CoercedDateSchema,
} from './schemas/coerced';

// Formats
export {
  EmailSchema,
  UuidSchema,
  UrlSchema,
  HostnameSchema,
  Ipv4Schema,
  Ipv6Schema,
  Base64Schema,
  HexSchema,
  JwtSchema,
  CuidSchema,
  UlidSchema,
  NanoidSchema,
  IsoDateSchema,
  IsoTimeSchema,
  IsoDatetimeSchema,
  IsoDurationSchema,
} from './schemas/formats';

// Transforms
export { preprocess } from './transforms/preprocess';

// Type inference utilities
export type { Infer, Output, Input } from './utils/type-inference';

// Factory Object
import { StringSchema } from './schemas/string';
import { NumberSchema } from './schemas/number';
import { BooleanSchema } from './schemas/boolean';
import { BigIntSchema } from './schemas/bigint';
import { DateSchema } from './schemas/date';
import { NanSchema } from './schemas/nan';
import { SymbolSchema } from './schemas/symbol';
import { AnySchema, UnknownSchema, NullSchema, UndefinedSchema, VoidSchema, NeverSchema } from './schemas/special';
import { ObjectSchema } from './schemas/object';
import { ArraySchema } from './schemas/array';
import { TupleSchema } from './schemas/tuple';
import { EnumSchema } from './schemas/enum';
import { LiteralSchema } from './schemas/literal';
import { UnionSchema } from './schemas/union';
import { DiscriminatedUnionSchema } from './schemas/discriminated-union';
import { IntersectionSchema } from './schemas/intersection';
import { RecordSchema } from './schemas/record';
import { MapSchema } from './schemas/map';
import { SetSchema } from './schemas/set';
import { FileSchema } from './schemas/file';
import { CustomSchema } from './schemas/custom';
import { InstanceOfSchema } from './schemas/instanceof';
import { LazySchema } from './schemas/lazy';
import {
  CoercedStringSchema,
  CoercedNumberSchema,
  CoercedBooleanSchema,
  CoercedBigIntSchema,
  CoercedDateSchema,
} from './schemas/coerced';
import {
  EmailSchema,
  UuidSchema,
  UrlSchema,
  HostnameSchema,
  Ipv4Schema,
  Ipv6Schema,
  Base64Schema,
  HexSchema,
  JwtSchema,
  CuidSchema,
  UlidSchema,
  NanoidSchema,
  IsoDateSchema,
  IsoTimeSchema,
  IsoDatetimeSchema,
  IsoDurationSchema,
} from './schemas/formats';
import type { Schema } from './core/schema';

export const s = {
  // Primitives
  string: () => new StringSchema(),
  number: () => new NumberSchema(),
  boolean: () => new BooleanSchema(),
  bigint: () => new BigIntSchema(),
  date: () => new DateSchema(),
  symbol: () => new SymbolSchema(),
  nan: () => new NanSchema(),
  int: () => new NumberSchema().int(),

  // Special
  any: () => new AnySchema(),
  unknown: () => new UnknownSchema(),
  null: () => new NullSchema(),
  undefined: () => new UndefinedSchema(),
  void: () => new VoidSchema(),
  never: () => new NeverSchema(),

  // Composites
  object: <T extends Record<string, Schema<any, any>>>(shape: T) => new ObjectSchema(shape),
  array: <T>(itemSchema: Schema<T>) => new ArraySchema(itemSchema),
  tuple: <T extends Schema<any, any>[]>(items: [...T]) => new TupleSchema(items),
  enum: <T extends readonly [string, ...string[]]>(values: T) => new EnumSchema(values),
  literal: <T extends string | number | boolean | null>(value: T) => new LiteralSchema(value),
  union: <T extends Schema<any, any>[]>(options: [...T]) => new UnionSchema(options),
  discriminatedUnion: <T extends ObjectSchema<any>[]>(discriminator: string, options: [...T]) =>
    new DiscriminatedUnionSchema(discriminator, options),
  intersection: <A, B>(left: Schema<A>, right: Schema<B>) => new IntersectionSchema(left, right),
  record: <V>(valueSchema: Schema<V>) => new RecordSchema(valueSchema),
  map: <K, V>(keySchema: Schema<K>, valueSchema: Schema<V>) => new MapSchema(keySchema, valueSchema),
  set: <V>(valueSchema: Schema<V>) => new SetSchema(valueSchema),
  file: () => new FileSchema(),
  custom: <T>(check: (value: unknown) => boolean, message?: string) => new CustomSchema<T>(check, message),
  instanceof: <T>(cls: new (...args: any[]) => T) => new InstanceOfSchema(cls),
  lazy: <T>(getter: () => Schema<T>) => new LazySchema(getter),

  // Formats
  email: () => new EmailSchema(),
  uuid: () => new UuidSchema(),
  url: () => new UrlSchema(),
  hostname: () => new HostnameSchema(),
  ipv4: () => new Ipv4Schema(),
  ipv6: () => new Ipv6Schema(),
  base64: () => new Base64Schema(),
  hex: () => new HexSchema(),
  jwt: () => new JwtSchema(),
  cuid: () => new CuidSchema(),
  ulid: () => new UlidSchema(),
  nanoid: () => new NanoidSchema(),

  // ISO formats
  iso: {
    date: () => new IsoDateSchema(),
    time: () => new IsoTimeSchema(),
    datetime: () => new IsoDatetimeSchema(),
    duration: () => new IsoDurationSchema(),
  },

  // Coercion
  coerce: {
    string: () => new CoercedStringSchema(),
    number: () => new CoercedNumberSchema(),
    boolean: () => new CoercedBooleanSchema(),
    bigint: () => new CoercedBigIntSchema(),
    date: () => new CoercedDateSchema(),
  },
};

export const schema = s;
