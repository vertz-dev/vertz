import { Schema, type SchemaAny } from '../core/schema';
import { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker, JSONSchemaObject } from '../introspection/json-schema';

function receivedType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export class RecordSchema<V> extends Schema<Record<string, V>> {
  private readonly _keySchema: Schema<string> | undefined;
  private readonly _valueSchema: Schema<V>;

  constructor(valueSchema: Schema<V>);
  constructor(keySchema: Schema<string>, valueSchema: Schema<V>);
  constructor(keyOrValue: SchemaAny, valueSchema?: Schema<V>) {
    super();
    if (valueSchema !== undefined) {
      this._keySchema = keyOrValue;
      this._valueSchema = valueSchema;
    } else {
      this._keySchema = undefined;
      this._valueSchema = keyOrValue;
    }
  }

  _parse(value: unknown, ctx: ParseContext): Record<string, V> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: 'Expected object, received ' + receivedType(value),
      });
      return value as Record<string, V>;
    }

    const obj = value as Record<string, unknown>;
    const result: Record<string, V> = {};

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

  _schemaType(): SchemaType {
    return SchemaType.Record;
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return {
      type: 'object',
      additionalProperties: this._valueSchema._toJSONSchemaWithRefs(tracker),
    };
  }

  _clone(): RecordSchema<V> {
    if (this._keySchema) {
      return this._cloneBase(new RecordSchema(this._keySchema, this._valueSchema));
    }
    return this._cloneBase(new RecordSchema(this._valueSchema));
  }
}
