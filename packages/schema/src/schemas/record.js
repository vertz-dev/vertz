import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';

function receivedType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
export class RecordSchema extends Schema {
  _keySchema;
  _valueSchema;
  constructor(keyOrValue, valueSchema) {
    super();
    if (valueSchema !== undefined) {
      this._keySchema = keyOrValue;
      this._valueSchema = valueSchema;
    } else {
      this._keySchema = undefined;
      this._valueSchema = keyOrValue;
    }
  }
  _parse(value, ctx) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected object, received ${receivedType(value)}`,
      });
      return value;
    }
    const obj = value;
    const result = {};
    for (const key of Object.keys(obj)) {
      ctx.pushPath(key);
      if (this._keySchema) {
        this._keySchema._runPipeline(key, ctx);
      }
      result[key] = this._valueSchema._runPipeline(obj[key], ctx);
      ctx.popPath();
    }
    return result;
  }
  _schemaType() {
    return SchemaType.Record;
  }
  _toJSONSchema(tracker) {
    return {
      type: 'object',
      additionalProperties: this._valueSchema._toJSONSchemaWithRefs(tracker),
    };
  }
  _clone() {
    if (this._keySchema) {
      return this._cloneBase(new RecordSchema(this._keySchema, this._valueSchema));
    }
    return this._cloneBase(new RecordSchema(this._valueSchema));
  }
}
//# sourceMappingURL=record.js.map
