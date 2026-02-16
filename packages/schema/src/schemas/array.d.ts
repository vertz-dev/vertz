import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class ArraySchema<T> extends Schema<T[]> {
  private readonly _element;
  private _min;
  private _max;
  private _length;
  constructor(element: Schema<T>);
  _parse(value: unknown, ctx: ParseContext): T[];
  min(n: number): ArraySchema<T>;
  max(n: number): ArraySchema<T>;
  length(n: number): ArraySchema<T>;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): ArraySchema<T>;
}
//# sourceMappingURL=array.d.ts.map
