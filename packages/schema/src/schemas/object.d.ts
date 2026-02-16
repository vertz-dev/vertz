import type { ParseContext } from '../core/parse-context';
import { DefaultSchema, OptionalSchema, Schema, type SchemaAny } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
type Shape = Record<string, SchemaAny>;
type InferShape<S extends Shape> = {
  [K in keyof S]: S[K]['_output'];
};
export declare class ObjectSchema<S extends Shape = Shape> extends Schema<InferShape<S>> {
  private readonly _shape;
  private _unknownKeys;
  private _catchall;
  constructor(shape: S);
  get shape(): S;
  private _isOptionalKey;
  _parse(value: unknown, ctx: ParseContext): InferShape<S>;
  strict(): ObjectSchema<S>;
  passthrough(): ObjectSchema<S>;
  extend<E extends Shape>(extension: E): ObjectSchema<S & E>;
  merge<O extends Shape>(other: ObjectSchema<O>): ObjectSchema<Omit<S, keyof O> & O>;
  pick<K extends keyof S & string>(...keys: K[]): ObjectSchema<Pick<S, K>>;
  required(): ObjectSchema<{
    [K in keyof S]: S[K] extends OptionalSchema<infer O, infer I>
      ? Schema<O, I>
      : S[K] extends DefaultSchema<infer O, infer I>
        ? Schema<O, I>
        : S[K];
  }>;
  partial(): ObjectSchema<
    {
      [K in keyof S]: OptionalSchema<S[K]['_output'], S[K]['_input']>;
    } & Shape
  >;
  omit<K extends keyof S & string>(...keys: K[]): ObjectSchema<Omit<S, K>>;
  keyof(): string[];
  catchall(schema: SchemaAny): ObjectSchema<S>;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): ObjectSchema<S>;
}
//# sourceMappingURL=object.d.ts.map
