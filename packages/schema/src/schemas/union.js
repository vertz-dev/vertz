import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class UnionSchema extends Schema {
  _options;
  constructor(options) {
    super();
    this._options = options;
  }
  _parse(value, ctx) {
    for (const option of this._options) {
      const result = option.safeParse(value);
      if (result.success) {
        return result.data;
      }
    }
    ctx.addIssue({
      code: ErrorCode.InvalidUnion,
      message: `Invalid input: value does not match any option in the union`,
    });
    return value;
  }
  _schemaType() {
    return SchemaType.Union;
  }
  _toJSONSchema(tracker) {
    return {
      anyOf: this._options.map((option) => option._toJSONSchemaWithRefs(tracker)),
    };
  }
  _clone() {
    return this._cloneBase(new UnionSchema(this._options));
  }
}
//# sourceMappingURL=union.js.map
