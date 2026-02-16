import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class BigIntSchema extends Schema {
  _parse(value, ctx) {
    if (typeof value !== 'bigint') {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected bigint, received ${typeof value}`,
      });
      return value;
    }
    return value;
  }
  _schemaType() {
    return SchemaType.BigInt;
  }
  _toJSONSchema(_tracker) {
    return { type: 'integer', format: 'int64' };
  }
  _clone() {
    return this._cloneBase(new BigIntSchema());
  }
}
//# sourceMappingURL=bigint.js.map
