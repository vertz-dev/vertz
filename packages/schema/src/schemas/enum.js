import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class EnumSchema extends Schema {
  _values;
  constructor(values) {
    super();
    this._values = values;
  }
  /** Public accessor for the enum's allowed values. */
  get values() {
    return this._values;
  }
  _parse(value, ctx) {
    if (!this._values.includes(value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidEnumValue,
        message: `Invalid enum value. Expected ${this._values.map((v) => `'${v}'`).join(' | ')}, received '${value}'`,
      });
    }
    return value;
  }
  _schemaType() {
    return SchemaType.Enum;
  }
  _toJSONSchema(_tracker) {
    return { enum: [...this._values] };
  }
  exclude(values) {
    const remaining = this._values.filter((v) => !values.includes(v));
    const schema = new EnumSchema(remaining);
    return this._cloneBase(schema);
  }
  extract(values) {
    const schema = new EnumSchema(values);
    return this._cloneBase(schema);
  }
  _clone() {
    return this._cloneBase(new EnumSchema(this._values));
  }
}
//# sourceMappingURL=enum.js.map
