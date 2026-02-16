import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class SetSchema<V> extends Schema<Set<V>> {
  private readonly _valueSchema;
  private _min;
  private _max;
  private _size;
  constructor(valueSchema: Schema<V>);
  _parse(value: unknown, ctx: ParseContext): Set<V>;
  min(n: number): SetSchema<V>;
  max(n: number): SetSchema<V>;
  size(n: number): SetSchema<V>;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): SetSchema<V>;
}
//# sourceMappingURL=set.d.ts.map
