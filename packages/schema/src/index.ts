// @vertz/schema — Public API
// Phase 1: Core Infrastructure

// Core
export { Schema } from './core/schema';
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

// Type inference utilities
export type { Infer, Output, Input } from './utils/type-inference';
