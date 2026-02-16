import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class LazySchema<T> extends Schema<T> {
  private readonly _getter;
  private _cached;
  constructor(getter: () => Schema<T>);
  private _resolve;
  _parse(value: unknown, ctx: ParseContext): T;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): LazySchema<T>;
}
//# sourceMappingURL=lazy.d.ts.map
