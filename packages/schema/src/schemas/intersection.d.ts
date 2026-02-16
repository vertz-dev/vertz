import type { ParseContext } from '../core/parse-context';
import { Schema, type SchemaAny } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class IntersectionSchema<L extends SchemaAny, R extends SchemaAny> extends Schema<
  L['_output'] & R['_output']
> {
  private readonly _left;
  private readonly _right;
  constructor(left: L, right: R);
  _parse(value: unknown, ctx: ParseContext): L['_output'] & R['_output'];
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): IntersectionSchema<L, R>;
}
//# sourceMappingURL=intersection.d.ts.map
