import { Schema } from '../core/schema';
import { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

export class SetSchema<V> extends Schema<Set<V>> {
  private readonly _valueSchema: Schema<V>;
  private _min: number | undefined;
  private _max: number | undefined;
  private _size: number | undefined;

  constructor(valueSchema: Schema<V>) {
    super();
    this._valueSchema = valueSchema;
  }

  _parse(value: unknown, ctx: ParseContext): Set<V> {
    if (!(value instanceof Set)) {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected Set, received ' + typeof value });
      return value as Set<V>;
    }
    const result = new Set<V>();
    let index = 0;
    for (const item of value) {
      ctx.pushPath(index);
      result.add(this._valueSchema._runPipeline(item, ctx));
      ctx.popPath();
      index++;
    }
    if (this._min !== undefined && result.size < this._min) {
      ctx.addIssue({ code: ErrorCode.TooSmall, message: `Set must contain at least ${this._min} element(s)` });
    }
    if (this._max !== undefined && result.size > this._max) {
      ctx.addIssue({ code: ErrorCode.TooBig, message: `Set must contain at most ${this._max} element(s)` });
    }
    if (this._size !== undefined && result.size !== this._size) {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: `Set must contain exactly ${this._size} element(s)` });
    }
    return result;
  }

  min(n: number): SetSchema<V> {
    const clone = this._clone();
    clone._min = n;
    return clone;
  }

  max(n: number): SetSchema<V> {
    const clone = this._clone();
    clone._max = n;
    return clone;
  }

  size(n: number): SetSchema<V> {
    const clone = this._clone();
    clone._size = n;
    return clone;
  }

  _schemaType(): SchemaType {
    return SchemaType.Set;
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    const schema: JSONSchemaObject = {
      type: 'array',
      uniqueItems: true,
      items: this._valueSchema._toJSONSchemaWithRefs(tracker),
    };
    if (this._min !== undefined) schema.minItems = this._min;
    if (this._max !== undefined) schema.maxItems = this._max;
    if (this._size !== undefined) {
      schema.minItems = this._size;
      schema.maxItems = this._size;
    }
    return schema;
  }

  _clone(): SetSchema<V> {
    const clone = this._cloneBase(new SetSchema(this._valueSchema));
    clone._min = this._min;
    clone._max = this._max;
    clone._size = this._size;
    return clone;
  }
}
