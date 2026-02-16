import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class SymbolSchema extends Schema {
  _parse(value, ctx) {
    if (typeof value !== 'symbol') {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected symbol, received ${typeof value}`,
      });
      return value;
    }
    return value;
  }
  _schemaType() {
    return SchemaType.Symbol;
  }
  _toJSONSchema(_tracker) {
    return { not: {} };
  }
  _clone() {
    return this._cloneBase(new SymbolSchema());
  }
}
//# sourceMappingURL=symbol.js.map
