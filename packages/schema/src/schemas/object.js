import { ErrorCode } from '../core/errors';
import { DefaultSchema, OptionalSchema, Schema } from '../core/schema';
import { SchemaType } from '../core/types';

function receivedType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
export class ObjectSchema extends Schema {
  _shape;
  _unknownKeys = 'strip';
  _catchall;
  constructor(shape) {
    super();
    this._shape = shape;
  }
  get shape() {
    return this._shape;
  }
  _isOptionalKey(schema) {
    return schema instanceof OptionalSchema || schema instanceof DefaultSchema;
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
    const shapeKeys = new Set(Object.keys(this._shape));
    for (const key of shapeKeys) {
      const schema = this._shape[key];
      if (!(key in obj) && schema && !this._isOptionalKey(schema)) {
        ctx.addIssue({
          code: ErrorCode.MissingProperty,
          message: `Missing required property "${key}"`,
          path: [key],
        });
        continue;
      }
      ctx.pushPath(key);
      result[key] = schema?._runPipeline(obj[key], ctx);
      ctx.popPath();
    }
    const unknownKeys = Object.keys(obj).filter((k) => !shapeKeys.has(k));
    if (unknownKeys.length > 0) {
      if (this._catchall) {
        for (const key of unknownKeys) {
          ctx.pushPath(key);
          result[key] = this._catchall._runPipeline(obj[key], ctx);
          ctx.popPath();
        }
      } else if (this._unknownKeys === 'strict') {
        ctx.addIssue({
          code: ErrorCode.UnrecognizedKeys,
          message: `Unrecognized key(s) in object: ${unknownKeys.map((k) => `"${k}"`).join(', ')}`,
        });
      } else if (this._unknownKeys === 'passthrough') {
        for (const key of unknownKeys) {
          result[key] = obj[key];
        }
      }
    }
    return result;
  }
  strict() {
    const clone = this._clone();
    clone._unknownKeys = 'strict';
    return clone;
  }
  passthrough() {
    const clone = this._clone();
    clone._unknownKeys = 'passthrough';
    return clone;
  }
  extend(extension) {
    return new ObjectSchema({ ...this._shape, ...extension });
  }
  merge(other) {
    // biome-ignore lint/suspicious/noExplicitAny: TS can't verify merged shape satisfies Omit<S, keyof O> & O
    return new ObjectSchema({ ...this._shape, ...other.shape });
  }
  pick(...keys) {
    const picked = {};
    for (const key of keys) {
      const schema = this._shape[key];
      if (schema) picked[key] = schema;
    }
    return new ObjectSchema(picked);
  }
  required() {
    const requiredShape = {};
    for (const [key, schema] of Object.entries(this._shape)) {
      if (schema instanceof OptionalSchema || schema instanceof DefaultSchema) {
        requiredShape[key] = schema.unwrap();
      } else {
        requiredShape[key] = schema;
      }
    }
    // biome-ignore lint/suspicious/noExplicitAny: TS can't verify runtime shape matches required mapped type
    return new ObjectSchema(requiredShape);
  }
  partial() {
    const partialShape = {};
    for (const [key, schema] of Object.entries(this._shape)) {
      partialShape[key] = schema instanceof OptionalSchema ? schema : schema.optional();
    }
    // biome-ignore lint/suspicious/noExplicitAny: TS can't verify runtime shape matches partial mapped type
    return new ObjectSchema(partialShape);
  }
  omit(...keys) {
    const keysToOmit = new Set(keys);
    const remaining = {};
    for (const [key, schema] of Object.entries(this._shape)) {
      if (!keysToOmit.has(key)) {
        remaining[key] = schema;
      }
    }
    return new ObjectSchema(remaining);
  }
  keyof() {
    return Object.keys(this._shape);
  }
  catchall(schema) {
    const clone = this._clone();
    clone._catchall = schema;
    clone._unknownKeys = 'strip';
    return clone;
  }
  _schemaType() {
    return SchemaType.Object;
  }
  _toJSONSchema(tracker) {
    const properties = {};
    const required = [];
    for (const [key, schema] of Object.entries(this._shape)) {
      properties[key] = schema._toJSONSchemaWithRefs(tracker);
      if (!this._isOptionalKey(schema)) {
        required.push(key);
      }
    }
    const schema = { type: 'object', properties };
    if (required.length > 0) {
      schema.required = required;
    }
    if (this._unknownKeys === 'strict') {
      schema.additionalProperties = false;
    }
    if (this._catchall) {
      schema.additionalProperties = this._catchall._toJSONSchemaWithRefs(tracker);
    }
    return schema;
  }
  _clone() {
    const clone = this._cloneBase(new ObjectSchema(this._shape));
    clone._unknownKeys = this._unknownKeys;
    clone._catchall = this._catchall;
    return clone;
  }
}
//# sourceMappingURL=object.js.map
