import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class MapSchema<K, V> extends Schema<Map<K, V>> {
  private readonly _keySchema;
  private readonly _valueSchema;
  constructor(keySchema: Schema<K>, valueSchema: Schema<V>);
  _parse(value: unknown, ctx: ParseContext): Map<K, V>;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): MapSchema<K, V>;
}
//# sourceMappingURL=map.d.ts.map
