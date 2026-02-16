import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class TupleSchema extends Schema {
  _items;
  _rest;
  constructor(items) {
    super();
    this._items = items;
  }
  _parse(value, ctx) {
    if (!Array.isArray(value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected array, received ${typeof value}`,
      });
      return value;
    }
    if (!this._rest && value.length !== this._items.length) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected array of length ${this._items.length}, received ${value.length}`,
      });
    }
    if (this._rest && value.length < this._items.length) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected at least ${this._items.length} element(s), received ${value.length}`,
      });
    }
    const result = [];
    for (let i = 0; i < this._items.length; i++) {
      ctx.pushPath(i);
      result.push(this._items[i]?._runPipeline(value[i], ctx));
      ctx.popPath();
    }
    if (this._rest) {
      for (let i = this._items.length; i < value.length; i++) {
        ctx.pushPath(i);
        result.push(this._rest._runPipeline(value[i], ctx));
        ctx.popPath();
      }
    }
    return result;
  }
  rest(schema) {
    const clone = this._clone();
    clone._rest = schema;
    return clone;
  }
  _schemaType() {
    return SchemaType.Tuple;
  }
  _toJSONSchema(tracker) {
    const prefixItems = this._items.map((item) => item._toJSONSchemaWithRefs(tracker));
    const schema = { type: 'array', prefixItems };
    schema.items = this._rest ? this._rest._toJSONSchemaWithRefs(tracker) : false;
    return schema;
  }
  _clone() {
    const clone = this._cloneBase(new TupleSchema(this._items));
    clone._rest = this._rest;
    return clone;
  }
}
//# sourceMappingURL=tuple.js.map
