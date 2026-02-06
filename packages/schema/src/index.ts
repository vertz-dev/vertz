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

// Transforms
export { preprocess } from './transforms/preprocess';

// Type inference utilities
export type { Infer, Output, Input } from './utils/type-inference';
