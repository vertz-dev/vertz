import type { ParseContext } from '../core/parse-context';
import { Schema, type SchemaAny } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
type TupleItems = [SchemaAny, ...SchemaAny[]];
type InferTuple<T extends TupleItems> = {
  [K in keyof T]: T[K] extends Schema<infer O> ? O : never;
};
export declare class TupleSchema<T extends TupleItems> extends Schema<InferTuple<T>> {
  private readonly _items;
  private _rest;
  constructor(items: T);
  _parse(value: unknown, ctx: ParseContext): InferTuple<T>;
  rest<R>(schema: Schema<R>): TupleSchema<T>;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): TupleSchema<T>;
}
//# sourceMappingURL=tuple.d.ts.map
