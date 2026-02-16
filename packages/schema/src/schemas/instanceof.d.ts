import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
type Constructor<T> = new (...args: any[]) => T;
export declare class InstanceOfSchema<T> extends Schema<T> {
  private readonly _cls;
  constructor(cls: Constructor<T>);
  _parse(value: unknown, ctx: ParseContext): T;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): InstanceOfSchema<T>;
}
//# sourceMappingURL=instanceof.d.ts.map
