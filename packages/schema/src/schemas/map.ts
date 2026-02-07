import { Schema } from '../core/schema';
import type { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

export class MapSchema<K, V> extends Schema<Map<K, V>> {
  private readonly _keySchema: Schema<K>;
  private readonly _valueSchema: Schema<V>;

  constructor(keySchema: Schema<K>, valueSchema: Schema<V>) {
    super();
    this._keySchema = keySchema;
    this._valueSchema = valueSchema;
  }

  _parse(value: unknown, ctx: ParseContext): Map<K, V> {
    if (!(value instanceof Map)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected Map, received ${typeof value}`,
      });
      return value as Map<K, V>;
    }
    const result = new Map<K, V>();
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

  _schemaType(): SchemaType {
    return SchemaType.Map;
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
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

  _clone(): MapSchema<K, V> {
    return this._cloneBase(new MapSchema(this._keySchema, this._valueSchema));
  }
}
