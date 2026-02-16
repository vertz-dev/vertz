import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class NanSchema extends Schema {
  _parse(value, ctx) {
    if (typeof value !== 'number' || !Number.isNaN(value)) {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected NaN' });
      return value;
    }
    return value;
  }
  _schemaType() {
    return SchemaType.NaN;
  }
  _toJSONSchema(_tracker) {
    return { not: {} };
  }
  _clone() {
    return this._cloneBase(new NanSchema());
  }
}
//# sourceMappingURL=nan.js.map
