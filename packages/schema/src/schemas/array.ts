import { Schema } from '../core/schema';
import type { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

export class ArraySchema<T> extends Schema<T[]> {
  private readonly _element: Schema<T>;
  private _min: number | undefined;
  private _max: number | undefined;
  private _length: number | undefined;

  constructor(element: Schema<T>) {
    super();
    this._element = element;
  }

  _parse(value: unknown, ctx: ParseContext): T[] {
    if (!Array.isArray(value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected array, received ${typeof value}`,
      });
      return value as T[];
    }
    if (this._min !== undefined && value.length < this._min) {
      ctx.addIssue({
        code: ErrorCode.TooSmall,
        message: `Array must contain at least ${this._min} element(s)`,
      });
    }
    if (this._max !== undefined && value.length > this._max) {
      ctx.addIssue({
        code: ErrorCode.TooBig,
        message: `Array must contain at most ${this._max} element(s)`,
      });
    }
    if (this._length !== undefined && value.length !== this._length) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Array must contain exactly ${this._length} element(s)`,
      });
    }
    const result: T[] = [];
    for (let i = 0; i < value.length; i++) {
      ctx.pushPath(i);
      result.push(this._element._runPipeline(value[i], ctx));
      ctx.popPath();
    }
    return result;
  }

  min(n: number): ArraySchema<T> {
    const clone = this._clone();
    clone._min = n;
    return clone;
  }

  max(n: number): ArraySchema<T> {
    const clone = this._clone();
    clone._max = n;
    return clone;
  }

  length(n: number): ArraySchema<T> {
    const clone = this._clone();
    clone._length = n;
    return clone;
  }

  _schemaType(): SchemaType {
    return SchemaType.Array;
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    const schema: JSONSchemaObject = {
      type: 'array',
      items: this._element._toJSONSchemaWithRefs(tracker),
    };
    if (this._min !== undefined) schema.minItems = this._min;
    if (this._max !== undefined) schema.maxItems = this._max;
    if (this._length !== undefined) {
      schema.minItems = this._length;
      schema.maxItems = this._length;
    }
    return schema;
  }

  _clone(): ArraySchema<T> {
    const clone = this._cloneBase(new ArraySchema(this._element));
    clone._min = this._min;
    clone._max = this._max;
    clone._length = this._length;
    return clone;
  }
}
