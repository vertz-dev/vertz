import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
import type { ObjectSchema } from './object';
type DiscriminatedOptions = [ObjectSchema<any>, ...ObjectSchema<any>[]];
type InferDiscriminatedUnion<T extends DiscriminatedOptions> = T[number] extends infer U
  ? U extends Schema<infer O>
    ? O
    : never
  : never;
export declare class DiscriminatedUnionSchema<T extends DiscriminatedOptions> extends Schema<
  InferDiscriminatedUnion<T>
> {
  private readonly _discriminator;
  private readonly _options;
  private readonly _lookup;
  constructor(discriminator: string, options: T);
  _parse(value: unknown, ctx: ParseContext): InferDiscriminatedUnion<T>;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): DiscriminatedUnionSchema<T>;
}
//# sourceMappingURL=discriminated-union.d.ts.map
