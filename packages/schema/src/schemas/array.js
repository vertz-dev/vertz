import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class ArraySchema extends Schema {
  _element;
  _min;
  _max;
  _length;
  constructor(element) {
    super();
    this._element = element;
  }
  _parse(value, ctx) {
    if (!Array.isArray(value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected array, received ${typeof value}`,
      });
      return value;
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
    const result = [];
    for (let i = 0; i < value.length; i++) {
      ctx.pushPath(i);
      result.push(this._element._runPipeline(value[i], ctx));
      ctx.popPath();
    }
    return result;
  }
  min(n) {
    const clone = this._clone();
    clone._min = n;
    return clone;
  }
  max(n) {
    const clone = this._clone();
    clone._max = n;
    return clone;
  }
  length(n) {
    const clone = this._clone();
    clone._length = n;
    return clone;
  }
  _schemaType() {
    return SchemaType.Array;
  }
  _toJSONSchema(tracker) {
    const schema = {
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
  _clone() {
    const clone = this._cloneBase(new ArraySchema(this._element));
    clone._min = this._min;
    clone._max = this._max;
    clone._length = this._length;
    return clone;
  }
}
//# sourceMappingURL=array.js.map
