import { Schema } from '../core/schema';
import { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import { LiteralSchema } from './literal';
import { ObjectSchema } from './object';
import type { RefTracker, JSONSchemaObject } from '../introspection/json-schema';

type DiscriminatedOptions = [ObjectSchema, ...ObjectSchema[]];
type InferDiscriminatedUnion<T extends DiscriminatedOptions> =
  T[number] extends Schema<infer O> ? O : never;

function receivedType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export class DiscriminatedUnionSchema<T extends DiscriminatedOptions> extends Schema<
  InferDiscriminatedUnion<T>
> {
  private readonly _discriminator: string;
  private readonly _options: T;
  private readonly _lookup: Map<unknown, ObjectSchema>;

  constructor(discriminator: string, options: T) {
    super();
    this._discriminator = discriminator;
    this._options = options;
    this._lookup = new Map();

    for (const option of options) {
      const discriminatorSchema = option.shape[discriminator];
      if (!(discriminatorSchema instanceof LiteralSchema)) {
        throw new Error(
          `Discriminated union requires all options to have a literal "${discriminator}" property`,
        );
      }
      this._lookup.set(discriminatorSchema.value, option);
    }
  }

  _parse(value: unknown, ctx: ParseContext): InferDiscriminatedUnion<T> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: 'Expected object, received ' + receivedType(value),
      });
      return value as InferDiscriminatedUnion<T>;
    }

    const obj = value as Record<string, unknown>;
    const discriminatorValue = obj[this._discriminator];

    if (discriminatorValue === undefined) {
      ctx.addIssue({
        code: ErrorCode.InvalidUnion,
        message: `Missing discriminator property "${this._discriminator}"`,
      });
      return value as InferDiscriminatedUnion<T>;
    }

    const matchedSchema = this._lookup.get(discriminatorValue);
    if (!matchedSchema) {
      const expected = [...this._lookup.keys()].map((k) => `'${k}'`).join(' | ');
      ctx.addIssue({
        code: ErrorCode.InvalidUnion,
        message: `Invalid discriminator value. Expected ${expected}, received '${discriminatorValue}'`,
      });
      return value as InferDiscriminatedUnion<T>;
    }

    return matchedSchema._runPipeline(value, ctx) as InferDiscriminatedUnion<T>;
  }

  _schemaType(): SchemaType {
    return SchemaType.DiscriminatedUnion;
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return {
      oneOf: this._options.map((option) => option._toJSONSchemaWithRefs(tracker)),
      discriminator: { propertyName: this._discriminator },
    };
  }

  _clone(): DiscriminatedUnionSchema<T> {
    return this._cloneBase(new DiscriminatedUnionSchema(this._discriminator, this._options));
  }
}
