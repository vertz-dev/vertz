import { ErrorCode } from '../core/errors';
import { BigIntSchema } from './bigint';
import { BooleanSchema } from './boolean';
import { DateSchema } from './date';
import { NumberSchema } from './number';
import { StringSchema } from './string';
export class CoercedStringSchema extends StringSchema {
  _parse(value, ctx) {
    return super._parse(value == null ? '' : String(value), ctx);
  }
  _clone() {
    const Ctor = this.constructor;
    return Object.assign(new Ctor(), super._clone());
  }
}
export class CoercedNumberSchema extends NumberSchema {
  _parse(value, ctx) {
    return super._parse(Number(value), ctx);
  }
  _clone() {
    return Object.assign(new CoercedNumberSchema(), super._clone());
  }
}
export class CoercedBooleanSchema extends BooleanSchema {
  _parse(value, ctx) {
    return super._parse(Boolean(value), ctx);
  }
  _clone() {
    return Object.assign(new CoercedBooleanSchema(), super._clone());
  }
}
export class CoercedBigIntSchema extends BigIntSchema {
  _parse(value, ctx) {
    if (typeof value === 'bigint') return super._parse(value, ctx);
    try {
      return super._parse(BigInt(value), ctx);
    } catch {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected value coercible to bigint' });
      return value;
    }
  }
  _clone() {
    return Object.assign(new CoercedBigIntSchema(), super._clone());
  }
}
export class CoercedDateSchema extends DateSchema {
  _parse(value, ctx) {
    if (value instanceof Date) return super._parse(value, ctx);
    return super._parse(new Date(value), ctx);
  }
  _clone() {
    return Object.assign(new CoercedDateSchema(), super._clone());
  }
}
//# sourceMappingURL=coerced.js.map
