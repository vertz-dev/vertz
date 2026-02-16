export type { ValidationIssue } from './core/errors';
export { ErrorCode, ParseError } from './core/errors';
export type { RefinementContext } from './core/parse-context';
export { ParseContext } from './core/parse-context';
export { SchemaRegistry } from './core/registry';
export type { ReadonlyOutput, SchemaAny } from './core/schema';
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
export { StringSchema } from './schemas/string';
export { SymbolSchema } from './schemas/symbol';
export { TupleSchema } from './schemas/tuple';
export { UnionSchema } from './schemas/union';
export { preprocess } from './transforms/preprocess';
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
import { StringSchema } from './schemas/string';
import { SymbolSchema } from './schemas/symbol';
import { TupleSchema } from './schemas/tuple';
import { UnionSchema } from './schemas/union';
export declare const s: {
  string: () => StringSchema;
  number: () => NumberSchema;
  boolean: () => BooleanSchema;
  bigint: () => BigIntSchema;
  date: () => DateSchema;
  symbol: () => SymbolSchema;
  nan: () => NanSchema;
  int: () => NumberSchema;
  any: () => AnySchema;
  unknown: () => UnknownSchema;
  null: () => NullSchema;
  undefined: () => UndefinedSchema;
  void: () => VoidSchema;
  never: () => NeverSchema;
  object: <T extends Record<string, SchemaAny>>(shape: T) => ObjectSchema<T>;
  array: <T>(itemSchema: Schema<T>) => ArraySchema<T>;
  tuple: <T extends [SchemaAny, ...SchemaAny[]]>(items: [...T]) => TupleSchema<T>;
  enum: <T extends readonly [string, ...string[]]>(values: T) => EnumSchema<T>;
  literal: <T extends string | number | boolean | null>(value: T) => LiteralSchema<T>;
  union: <T extends [SchemaAny, ...SchemaAny[]]>(options: [...T]) => UnionSchema<T>;
  discriminatedUnion: <T extends [ObjectSchema<any>, ...ObjectSchema<any>[]]>(
    discriminator: string,
    options: [...T],
  ) => DiscriminatedUnionSchema<T>;
  intersection: <L extends SchemaAny, R extends SchemaAny>(
    left: L,
    right: R,
  ) => IntersectionSchema<L, R>;
  record: <V>(valueSchema: Schema<V>) => RecordSchema<V>;
  map: <K, V>(keySchema: Schema<K>, valueSchema: Schema<V>) => MapSchema<K, V>;
  set: <V>(valueSchema: Schema<V>) => SetSchema<V>;
  file: () => FileSchema;
  custom: <T>(check: (value: unknown) => boolean, message?: string) => CustomSchema<T>;
  instanceof: <T>(cls: new (...args: any[]) => T) => InstanceOfSchema<T>;
  lazy: <T>(getter: () => Schema<T>) => LazySchema<T>;
  email: () => EmailSchema;
  uuid: () => UuidSchema;
  url: () => UrlSchema;
  hostname: () => HostnameSchema;
  ipv4: () => Ipv4Schema;
  ipv6: () => Ipv6Schema;
  base64: () => Base64Schema;
  hex: () => HexSchema;
  jwt: () => JwtSchema;
  cuid: () => CuidSchema;
  ulid: () => UlidSchema;
  nanoid: () => NanoidSchema;
  iso: {
    date: () => IsoDateSchema;
    time: () => IsoTimeSchema;
    datetime: () => IsoDatetimeSchema;
    duration: () => IsoDurationSchema;
  };
  fromDbEnum: <const TValues extends readonly [string, ...string[]]>(column: {
    _meta: {
      enumValues: TValues;
    };
  }) => EnumSchema<TValues>;
  coerce: {
    string: () => CoercedStringSchema;
    number: () => CoercedNumberSchema;
    boolean: () => CoercedBooleanSchema;
    bigint: () => CoercedBigIntSchema;
    date: () => CoercedDateSchema;
  };
};
export declare const schema: typeof s;
//# sourceMappingURL=index.d.ts.map
