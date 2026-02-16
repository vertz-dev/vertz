import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class RecordSchema<V> extends Schema<Record<string, V>> {
  private readonly _keySchema;
  private readonly _valueSchema;
  constructor(valueSchema: Schema<V>);
  constructor(keySchema: Schema<string>, valueSchema: Schema<V>);
  _parse(value: unknown, ctx: ParseContext): Record<string, V>;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): RecordSchema<V>;
}
//# sourceMappingURL=record.d.ts.map
