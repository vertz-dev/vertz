import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class LiteralSchema extends Schema {
  _value;
  constructor(value) {
    super();
    this._value = value;
  }
  get value() {
    return this._value;
  }
  _parse(value, ctx) {
    if (value !== this._value) {
      ctx.addIssue({
        code: ErrorCode.InvalidLiteral,
        message: `Expected ${JSON.stringify(this._value)}, received ${JSON.stringify(value)}`,
      });
    }
    return value;
  }
  _schemaType() {
    return SchemaType.Literal;
  }
  _toJSONSchema(_tracker) {
    return { const: this._value };
  }
  _clone() {
    return this._cloneBase(new LiteralSchema(this._value));
  }
}
//# sourceMappingURL=literal.js.map
