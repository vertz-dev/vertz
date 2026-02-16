// @vertz/schema — Public API
export { ErrorCode, ParseError } from './core/errors';
export { ParseContext } from './core/parse-context';
export { SchemaRegistry } from './core/registry';
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
export { SchemaType } from './core/types';
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
  object: (shape) => new ObjectSchema(shape),
  array: (itemSchema) => new ArraySchema(itemSchema),
  tuple: (items) => new TupleSchema(items),
  enum: (values) => new EnumSchema(values),
  literal: (value) => new LiteralSchema(value),
  union: (options) => new UnionSchema(options),
  // biome-ignore lint/suspicious/noExplicitAny: ObjectSchema<any> needed for covariant constraint on concrete shapes
  discriminatedUnion: (discriminator, options) =>
    new DiscriminatedUnionSchema(discriminator, options),
  intersection: (left, right) => new IntersectionSchema(left, right),
  record: (valueSchema) => new RecordSchema(valueSchema),
  map: (keySchema, valueSchema) => new MapSchema(keySchema, valueSchema),
  set: (valueSchema) => new SetSchema(valueSchema),
  file: () => new FileSchema(),
  custom: (check, message) => new CustomSchema(check, message),
  // biome-ignore lint/suspicious/noExplicitAny: standard TS pattern for any-constructor constraint
  instanceof: (cls) => new InstanceOfSchema(cls),
  lazy: (getter) => new LazySchema(getter),
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
  // Database enum bridge
  fromDbEnum: (column) => {
    const values = column._meta.enumValues;
    if (!values || values.length === 0) {
      throw new Error('s.fromDbEnum(): not an enum column — _meta.enumValues is missing or empty');
    }
    return new EnumSchema(values);
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
//# sourceMappingURL=index.js.map
