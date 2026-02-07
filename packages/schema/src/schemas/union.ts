import { Schema, type SchemaAny } from '../core/schema';
import type { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

type UnionOptions = [SchemaAny, ...SchemaAny[]];
type InferUnion<T extends UnionOptions> = T[number] extends Schema<infer O> ? O : never;

export class UnionSchema<T extends UnionOptions> extends Schema<InferUnion<T>> {
  private readonly _options: T;

  constructor(options: T) {
    super();
    this._options = options;
  }

  _parse(value: unknown, ctx: ParseContext): InferUnion<T> {
    for (const option of this._options) {
      const result = option.safeParse(value);
      if (result.success) {
        return result.data;
      }
    }
    ctx.addIssue({
      code: ErrorCode.InvalidUnion,
      message: `Invalid input: value does not match any option in the union`,
    });
    return value as InferUnion<T>;
  }

  _schemaType(): SchemaType {
    return SchemaType.Union;
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return {
      anyOf: this._options.map((option) => option._toJSONSchemaWithRefs(tracker)),
    };
  }

  _clone(): UnionSchema<T> {
    return this._cloneBase(new UnionSchema(this._options));
  }
}
