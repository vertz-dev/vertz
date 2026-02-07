// @vertz/schema — Public API

export type { ValidationIssue } from './core/errors';
export { ErrorCode, ParseError } from './core/errors';
export type { RefinementContext } from './core/parse-context';
export { ParseContext } from './core/parse-context';
export { SchemaRegistry } from './core/registry';
export type { SchemaAny } from './core/schema';
// Core
export {
  BrandedSchema,
  CatchSchema,
  DefaultSchema,
  NullableSchema,
  OptionalSchema,
  PipeSchema,
  ReadonlySchema,
  RefinedSchema,
  Schema,
  SuperRefinedSchema,
  TransformSchema,
} from './core/schema';
export type { SafeParseResult, SchemaMetadata } from './core/types';
export { SchemaType } from './core/types';
export type { JSONSchemaObject } from './introspection/json-schema';
// Introspection
export { RefTracker, toJSONSchema } from './introspection/json-schema';
export { ArraySchema } from './schemas/array';
export { BigIntSchema } from './schemas/bigint';
export { BooleanSchema } from './schemas/boolean';
export {
  CoercedBigIntSchema,
  CoercedBooleanSchema,
  CoercedDateSchema,
  CoercedNumberSchema,
  CoercedStringSchema,
} from './schemas/coerced';
export { CustomSchema } from './schemas/custom';
export { DateSchema } from './schemas/date';
export { DiscriminatedUnionSchema } from './schemas/discriminated-union';
export { EnumSchema } from './schemas/enum';
export { FileSchema } from './schemas/file';
// Formats
export {
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
} from './schemas/formats';
export { InstanceOfSchema } from './schemas/instanceof';
export { IntersectionSchema } from './schemas/intersection';
export { LazySchema } from './schemas/lazy';
export { LiteralSchema } from './schemas/literal';
export { MapSchema } from './schemas/map';
export { NanSchema } from './schemas/nan';
export { NumberSchema } from './schemas/number';
export { ObjectSchema } from './schemas/object';
export { RecordSchema } from './schemas/record';
export { SetSchema } from './schemas/set';
export {
  AnySchema,
  NeverSchema,
  NullSchema,
  UndefinedSchema,
  UnknownSchema,
  VoidSchema,
} from './schemas/special';
// Schemas
export { StringSchema } from './schemas/string';
export { SymbolSchema } from './schemas/symbol';
export { TupleSchema } from './schemas/tuple';
export { UnionSchema } from './schemas/union';

// Transforms
export { preprocess } from './transforms/preprocess';

// Type inference utilities
export type { Infer, Input, Output } from './utils/type-inference';

import type { Schema, SchemaAny } from './core/schema';
import { ArraySchema } from './schemas/array';
import { BigIntSchema } from './schemas/bigint';
import { BooleanSchema } from './schemas/boolean';
import {
  CoercedBigIntSchema,
  CoercedBooleanSchema,
  CoercedDateSchema,
  CoercedNumberSchema,
  CoercedStringSchema,
} from './schemas/coerced';
import { CustomSchema } from './schemas/custom';
import { DateSchema } from './schemas/date';
import { DiscriminatedUnionSchema } from './schemas/discriminated-union';
import { EnumSchema } from './schemas/enum';
import { FileSchema } from './schemas/file';
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
} from './schemas/formats';
import { InstanceOfSchema } from './schemas/instanceof';
import { IntersectionSchema } from './schemas/intersection';
import { LazySchema } from './schemas/lazy';
import { LiteralSchema } from './schemas/literal';
import { MapSchema } from './schemas/map';
import { NanSchema } from './schemas/nan';
import { NumberSchema } from './schemas/number';
import { ObjectSchema } from './schemas/object';
import { RecordSchema } from './schemas/record';
import { SetSchema } from './schemas/set';
import {
  AnySchema,
  NeverSchema,
  NullSchema,
  UndefinedSchema,
  UnknownSchema,
  VoidSchema,
} from './schemas/special';
// Factory Object
import { StringSchema } from './schemas/string';
import { SymbolSchema } from './schemas/symbol';
import { TupleSchema } from './schemas/tuple';
import { UnionSchema } from './schemas/union';

export const s = {
  // Primitives
  string: (): StringSchema => new StringSchema(),
  number: (): NumberSchema => new NumberSchema(),
  boolean: (): BooleanSchema => new BooleanSchema(),
  bigint: (): BigIntSchema => new BigIntSchema(),
  date: (): DateSchema => new DateSchema(),
  symbol: (): SymbolSchema => new SymbolSchema(),
  nan: (): NanSchema => new NanSchema(),
  int: (): NumberSchema => new NumberSchema().int(),

  // Special
  any: (): AnySchema => new AnySchema(),
  unknown: (): UnknownSchema => new UnknownSchema(),
  null: (): NullSchema => new NullSchema(),
  undefined: (): UndefinedSchema => new UndefinedSchema(),
  void: (): VoidSchema => new VoidSchema(),
  never: (): NeverSchema => new NeverSchema(),

  // Composites
  object: <T extends Record<string, SchemaAny>>(shape: T): ObjectSchema<T> =>
    new ObjectSchema(shape),
  array: <T>(itemSchema: Schema<T>): ArraySchema<T> => new ArraySchema(itemSchema),
  tuple: <T extends [SchemaAny, ...SchemaAny[]]>(items: [...T]): TupleSchema<T> =>
    new TupleSchema(items),
  enum: <T extends readonly [string, ...string[]]>(values: T): EnumSchema<T> =>
    new EnumSchema(values),
  literal: <T extends string | number | boolean | null>(value: T): LiteralSchema<T> =>
    new LiteralSchema(value),
  union: <T extends [SchemaAny, ...SchemaAny[]]>(options: [...T]): UnionSchema<T> =>
    new UnionSchema(options),
  discriminatedUnion: <T extends [ObjectSchema, ...ObjectSchema[]]>(
    discriminator: string,
    options: [...T],
  ): DiscriminatedUnionSchema<T> => new DiscriminatedUnionSchema(discriminator, options),
  intersection: <L extends SchemaAny, R extends SchemaAny>(
    left: L,
    right: R,
  ): IntersectionSchema<L, R> => new IntersectionSchema(left, right),
  record: <V>(valueSchema: Schema<V>): RecordSchema<V> => new RecordSchema(valueSchema),
  map: <K, V>(keySchema: Schema<K>, valueSchema: Schema<V>): MapSchema<K, V> =>
    new MapSchema(keySchema, valueSchema),
  set: <V>(valueSchema: Schema<V>): SetSchema<V> => new SetSchema(valueSchema),
  file: (): FileSchema => new FileSchema(),
  custom: <T>(check: (value: unknown) => boolean, message?: string): CustomSchema<T> =>
    new CustomSchema<T>(check, message),
  // biome-ignore lint/suspicious/noExplicitAny: standard TS pattern for any-constructor constraint
  instanceof: <T>(cls: new (...args: any[]) => T): InstanceOfSchema<T> => new InstanceOfSchema(cls),
  lazy: <T>(getter: () => Schema<T>): LazySchema<T> => new LazySchema(getter),

  // Formats
  email: (): EmailSchema => new EmailSchema(),
  uuid: (): UuidSchema => new UuidSchema(),
  url: (): UrlSchema => new UrlSchema(),
  hostname: (): HostnameSchema => new HostnameSchema(),
  ipv4: (): Ipv4Schema => new Ipv4Schema(),
  ipv6: (): Ipv6Schema => new Ipv6Schema(),
  base64: (): Base64Schema => new Base64Schema(),
  hex: (): HexSchema => new HexSchema(),
  jwt: (): JwtSchema => new JwtSchema(),
  cuid: (): CuidSchema => new CuidSchema(),
  ulid: (): UlidSchema => new UlidSchema(),
  nanoid: (): NanoidSchema => new NanoidSchema(),

  // ISO formats
  iso: {
    date: (): IsoDateSchema => new IsoDateSchema(),
    time: (): IsoTimeSchema => new IsoTimeSchema(),
    datetime: (): IsoDatetimeSchema => new IsoDatetimeSchema(),
    duration: (): IsoDurationSchema => new IsoDurationSchema(),
  },

  // Coercion
  coerce: {
    string: (): CoercedStringSchema => new CoercedStringSchema(),
    number: (): CoercedNumberSchema => new CoercedNumberSchema(),
    boolean: (): CoercedBooleanSchema => new CoercedBooleanSchema(),
    bigint: (): CoercedBigIntSchema => new CoercedBigIntSchema(),
    date: (): CoercedDateSchema => new CoercedDateSchema(),
  },
};

export const schema: typeof s = s;
