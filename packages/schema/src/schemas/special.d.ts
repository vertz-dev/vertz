import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class AnySchema extends Schema<any> {
  _parse(value: unknown, _ctx: ParseContext): any;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): AnySchema;
}
export declare class UnknownSchema extends Schema<unknown> {
  _parse(value: unknown, _ctx: ParseContext): unknown;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): UnknownSchema;
}
export declare class NullSchema extends Schema<null> {
  _parse(value: unknown, ctx: ParseContext): null;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): NullSchema;
}
export declare class UndefinedSchema extends Schema<undefined> {
  _parse(value: unknown, ctx: ParseContext): undefined;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): UndefinedSchema;
}
export declare class VoidSchema extends Schema<void> {
  _parse(value: unknown, ctx: ParseContext): void;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): VoidSchema;
}
export declare class NeverSchema extends Schema<never> {
  _parse(value: unknown, ctx: ParseContext): never;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): NeverSchema;
}
//# sourceMappingURL=special.d.ts.map
