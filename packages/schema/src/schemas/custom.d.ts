import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class CustomSchema<T> extends Schema<T> {
  private readonly _check;
  private readonly _message;
  constructor(check: (value: unknown) => boolean, message?: string);
  _parse(value: unknown, ctx: ParseContext): T;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): CustomSchema<T>;
}
//# sourceMappingURL=custom.d.ts.map
