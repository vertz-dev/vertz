import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
type LiteralValue = string | number | boolean | null;
export declare class LiteralSchema<T extends LiteralValue> extends Schema<T> {
  private readonly _value;
  constructor(value: T);
  get value(): T;
  _parse(value: unknown, ctx: ParseContext): T;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): LiteralSchema<T>;
}
//# sourceMappingURL=literal.d.ts.map
