import { ErrorCode } from '../core/errors';
import type { ParseContext } from '../core/parse-context';
import { DefaultSchema, OptionalSchema, Schema, type SchemaAny } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';

type Shape = Record<string, SchemaAny>;

type InferShape<S extends Shape> = {
  [K in keyof S]: S[K]['_output'];
};

type UnknownKeyMode = 'strip' | 'strict' | 'passthrough';

function receivedType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export class ObjectSchema<S extends Shape = Shape> extends Schema<InferShape<S>> {
  private readonly _shape: S;
  private _unknownKeys: UnknownKeyMode = 'strip';
  private _catchall: SchemaAny | undefined;

  constructor(shape: S) {
    super();
    this._shape = shape;
  }

  get shape(): S {
    return this._shape;
  }

  private _isOptionalKey(schema: SchemaAny): boolean {
    return schema instanceof OptionalSchema || schema instanceof DefaultSchema;
  }

  _parse(value: unknown, ctx: ParseContext): InferShape<S> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected object, received ${receivedType(value)}`,
      });
      return value as InferShape<S>;
    }
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
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

    return result as InferShape<S>;
  }

  strict(): ObjectSchema<S> {
    const clone = this._clone();
    clone._unknownKeys = 'strict';
    return clone;
  }

  passthrough(): ObjectSchema<S> {
    const clone = this._clone();
    clone._unknownKeys = 'passthrough';
    return clone;
  }

  extend<E extends Shape>(extension: E): ObjectSchema<S & E> {
    return new ObjectSchema({ ...this._shape, ...extension } as S & E);
  }

  merge<O extends Shape>(other: ObjectSchema<O>): ObjectSchema<Omit<S, keyof O> & O> {
    // biome-ignore lint/suspicious/noExplicitAny: TS can't verify merged shape satisfies Omit<S, keyof O> & O
    return new ObjectSchema({ ...this._shape, ...other.shape } as any);
  }

  pick<K extends keyof S & string>(...keys: K[]): ObjectSchema<Pick<S, K>> {
    const picked: Record<string, SchemaAny> = {};
    for (const key of keys) {
      const schema = this._shape[key];
      if (schema) picked[key] = schema;
    }
    return new ObjectSchema(picked as Pick<S, K>);
  }

  required(): ObjectSchema<{
    [K in keyof S]: S[K] extends OptionalSchema<infer O, infer I>
      ? Schema<O, I>
      : S[K] extends DefaultSchema<infer O, infer I>
        ? Schema<O, I>
        : S[K];
  }> {
    const requiredShape: Record<string, SchemaAny> = {};
    for (const [key, schema] of Object.entries(this._shape)) {
      if (schema instanceof OptionalSchema || schema instanceof DefaultSchema) {
        requiredShape[key] = schema.unwrap();
      } else {
        requiredShape[key] = schema;
      }
    }
    // biome-ignore lint/suspicious/noExplicitAny: TS can't verify runtime shape matches required mapped type
    return new ObjectSchema(requiredShape as any);
  }

  partial(): ObjectSchema<{ [K in keyof S]: OptionalSchema<S[K]['_output'], S[K]['_input']> }> {
    const partialShape: Record<string, SchemaAny> = {};
    for (const [key, schema] of Object.entries(this._shape)) {
      partialShape[key] = schema instanceof OptionalSchema ? schema : schema.optional();
    }
    // biome-ignore lint/suspicious/noExplicitAny: TS can't verify runtime shape matches partial mapped type
    return new ObjectSchema(partialShape as any);
  }

  omit<K extends keyof S & string>(...keys: K[]): ObjectSchema<Omit<S, K>> {
    const keysToOmit = new Set<string>(keys);
    const remaining: Record<string, SchemaAny> = {};
    for (const [key, schema] of Object.entries(this._shape)) {
      if (!keysToOmit.has(key)) {
        remaining[key] = schema;
      }
    }
    return new ObjectSchema(remaining as Omit<S, K>);
  }

  keyof(): string[] {
    return Object.keys(this._shape);
  }

  catchall(schema: SchemaAny): ObjectSchema<S> {
    const clone = this._clone();
    clone._catchall = schema;
    clone._unknownKeys = 'strip';
    return clone;
  }

  _schemaType(): SchemaType {
    return SchemaType.Object;
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    const properties: Record<string, JSONSchemaObject> = {};
    const required: string[] = [];
    for (const [key, schema] of Object.entries(this._shape)) {
      properties[key] = schema._toJSONSchemaWithRefs(tracker);
      if (!this._isOptionalKey(schema)) {
        required.push(key);
      }
    }
    const schema: JSONSchemaObject = { type: 'object', properties };
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

  _clone(): ObjectSchema<S> {
    const clone = this._cloneBase(new ObjectSchema(this._shape));
    clone._unknownKeys = this._unknownKeys;
    clone._catchall = this._catchall;
    return clone;
  }
}
