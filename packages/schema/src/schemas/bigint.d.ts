import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class BigIntSchema extends Schema<bigint> {
  _parse(value: unknown, ctx: ParseContext): bigint;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): BigIntSchema;
}
//# sourceMappingURL=bigint.d.ts.map
