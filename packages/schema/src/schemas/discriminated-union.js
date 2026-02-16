import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import { LiteralSchema } from './literal';

function receivedType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
export class DiscriminatedUnionSchema extends Schema {
  _discriminator;
  _options;
  // biome-ignore lint/suspicious/noExplicitAny: erased shape type for runtime lookup
  _lookup;
  constructor(discriminator, options) {
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
  _parse(value, ctx) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected object, received ${receivedType(value)}`,
      });
      return value;
    }
    const obj = value;
    const discriminatorValue = obj[this._discriminator];
    if (discriminatorValue === undefined) {
      ctx.addIssue({
        code: ErrorCode.InvalidUnion,
        message: `Missing discriminator property "${this._discriminator}"`,
      });
      return value;
    }
    const matchedSchema = this._lookup.get(discriminatorValue);
    if (!matchedSchema) {
      const expected = [...this._lookup.keys()].map((k) => `'${k}'`).join(' | ');
      ctx.addIssue({
        code: ErrorCode.InvalidUnion,
        message: `Invalid discriminator value. Expected ${expected}, received '${discriminatorValue}'`,
      });
      return value;
    }
    return matchedSchema._runPipeline(value, ctx);
  }
  _schemaType() {
    return SchemaType.DiscriminatedUnion;
  }
  _toJSONSchema(tracker) {
    return {
      oneOf: this._options.map((option) => option._toJSONSchemaWithRefs(tracker)),
      discriminator: { propertyName: this._discriminator },
    };
  }
  _clone() {
    return this._cloneBase(new DiscriminatedUnionSchema(this._discriminator, this._options));
  }
}
//# sourceMappingURL=discriminated-union.js.map
