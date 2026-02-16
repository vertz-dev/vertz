import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class MapSchema extends Schema {
  _keySchema;
  _valueSchema;
  constructor(keySchema, valueSchema) {
    super();
    this._keySchema = keySchema;
    this._valueSchema = valueSchema;
  }
  _parse(value, ctx) {
    if (!(value instanceof Map)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected Map, received ${typeof value}`,
      });
      return value;
    }
    const result = new Map();
    let index = 0;
    for (const [k, v] of value) {
      ctx.pushPath(index);
      const parsedKey = this._keySchema._runPipeline(k, ctx);
      const parsedValue = this._valueSchema._runPipeline(v, ctx);
      result.set(parsedKey, parsedValue);
      ctx.popPath();
      index++;
    }
    return result;
  }
  _schemaType() {
    return SchemaType.Map;
  }
  _toJSONSchema(tracker) {
    return {
      type: 'array',
      items: {
        type: 'array',
        prefixItems: [
          this._keySchema._toJSONSchemaWithRefs(tracker),
          this._valueSchema._toJSONSchemaWithRefs(tracker),
        ],
        items: false,
      },
    };
  }
  _clone() {
    return this._cloneBase(new MapSchema(this._keySchema, this._valueSchema));
  }
}
//# sourceMappingURL=map.js.map
