import { Schema } from '../core/schema';
import { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

type TupleItems = [Schema<any>, ...Schema<any>[]];
type InferTuple<T extends TupleItems> = { [K in keyof T]: T[K] extends Schema<infer O> ? O : never };

export class TupleSchema<T extends TupleItems> extends Schema<InferTuple<T>> {
  private readonly _items: T;
  private _rest: Schema<any> | undefined;

  constructor(items: T) {
    super();
    this._items = items;
  }

  _parse(value: unknown, ctx: ParseContext): InferTuple<T> {
    if (!Array.isArray(value)) {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected array, received ' + typeof value });
      return value as InferTuple<T>;
    }
    if (!this._rest && value.length !== this._items.length) {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: `Expected array of length ${this._items.length}, received ${value.length}` });
    }
    if (this._rest && value.length < this._items.length) {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: `Expected at least ${this._items.length} element(s), received ${value.length}` });
    }
    const result: unknown[] = [];
    for (let i = 0; i < this._items.length; i++) {
      ctx.pushPath(i);
      result.push(this._items[i]!._runPipeline(value[i], ctx));
      ctx.popPath();
    }
    if (this._rest) {
      for (let i = this._items.length; i < value.length; i++) {
        ctx.pushPath(i);
        result.push(this._rest._runPipeline(value[i], ctx));
        ctx.popPath();
      }
    }
    return result as InferTuple<T>;
  }

  rest<R>(schema: Schema<R>): TupleSchema<T> {
    const clone = this._clone();
    clone._rest = schema;
    return clone;
  }

  _schemaType(): SchemaType {
    return SchemaType.Tuple;
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    const prefixItems = this._items.map(item => item._toJSONSchemaWithRefs(tracker));
    const schema: JSONSchemaObject = { type: 'array', prefixItems };
    schema.items = this._rest ? this._rest._toJSONSchemaWithRefs(tracker) : false;
    return schema;
  }

  _clone(): TupleSchema<T> {
    const clone = this._cloneBase(new TupleSchema(this._items));
    clone._rest = this._rest;
    return clone;
  }
}
