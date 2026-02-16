import type { ParseContext } from '../core/parse-context';
import { Schema, type SchemaAny } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
type UnionOptions = [SchemaAny, ...SchemaAny[]];
type InferUnion<T extends UnionOptions> = T[number] extends infer U
  ? U extends Schema<infer O>
    ? O
    : never
  : never;
export declare class UnionSchema<T extends UnionOptions> extends Schema<InferUnion<T>> {
  private readonly _options;
  constructor(options: T);
  _parse(value: unknown, ctx: ParseContext): InferUnion<T>;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): UnionSchema<T>;
}
//# sourceMappingURL=union.d.ts.map
