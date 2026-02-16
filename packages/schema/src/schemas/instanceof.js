import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class InstanceOfSchema extends Schema {
  _cls;
  constructor(cls) {
    super();
    this._cls = cls;
  }
  _parse(value, ctx) {
    if (!(value instanceof this._cls)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected instance of ${this._cls.name}`,
      });
      return value;
    }
    return value;
  }
  _schemaType() {
    return SchemaType.InstanceOf;
  }
  _toJSONSchema(_tracker) {
    return {};
  }
  _clone() {
    return this._cloneBase(new InstanceOfSchema(this._cls));
  }
}
//# sourceMappingURL=instanceof.js.map
