import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class CustomSchema extends Schema {
  _check;
  _message;
  constructor(check, message) {
    super();
    this._check = check;
    this._message = message ?? 'Custom validation failed';
  }
  _parse(value, ctx) {
    if (!this._check(value)) {
      ctx.addIssue({ code: ErrorCode.Custom, message: this._message });
    }
    return value;
  }
  _schemaType() {
    return SchemaType.Custom;
  }
  _toJSONSchema(_tracker) {
    return {};
  }
  _clone() {
    return this._cloneBase(new CustomSchema(this._check, this._message));
  }
}
//# sourceMappingURL=custom.js.map
