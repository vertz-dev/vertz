import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class EnumSchema<T extends readonly [string, ...string[]]> extends Schema<
  T[number]
> {
  private readonly _values;
  constructor(values: T);
  /** Public accessor for the enum's allowed values. */
  get values(): T;
  _parse(value: unknown, ctx: ParseContext): T[number];
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  exclude<E extends T[number]>(values: E[]): EnumSchema<readonly [string, ...string[]]>;
  extract<E extends T[number]>(values: E[]): EnumSchema<readonly [string, ...string[]]>;
  _clone(): EnumSchema<T>;
}
//# sourceMappingURL=enum.d.ts.map
