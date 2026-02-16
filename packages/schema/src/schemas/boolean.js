import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class BooleanSchema extends Schema {
  _parse(value, ctx) {
    if (typeof value !== 'boolean') {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected boolean, received ${typeof value}`,
      });
      return value;
    }
    return value;
  }
  _schemaType() {
    return SchemaType.Boolean;
  }
  _toJSONSchema(_tracker) {
    return { type: 'boolean' };
  }
  _clone() {
    return this._cloneBase(new BooleanSchema());
  }
}
//# sourceMappingURL=boolean.js.map
