import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class BooleanSchema extends Schema<boolean> {
  _parse(value: unknown, ctx: ParseContext): boolean;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): BooleanSchema;
}
//# sourceMappingURL=boolean.d.ts.map
