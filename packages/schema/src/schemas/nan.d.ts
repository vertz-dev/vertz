import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class NanSchema extends Schema<number> {
  _parse(value: unknown, ctx: ParseContext): number;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): NanSchema;
}
//# sourceMappingURL=nan.d.ts.map
