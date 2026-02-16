import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class NumberSchema extends Schema {
  _gte;
  _gteMessage;
  _gt;
  _gtMessage;
  _lte;
  _lteMessage;
  _lt;
  _ltMessage;
  _int = false;
  _positive = false;
  _negative = false;
  _nonnegative = false;
  _nonpositive = false;
  _multipleOf;
  _finite = false;
  _parse(value, ctx) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected number, received ${typeof value}`,
      });
      return value;
    }
    if (this._gte !== undefined && value < this._gte) {
      ctx.addIssue({
        code: ErrorCode.TooSmall,
        message: this._gteMessage ?? `Number must be greater than or equal to ${this._gte}`,
      });
    }
    if (this._gt !== undefined && value <= this._gt) {
      ctx.addIssue({
        code: ErrorCode.TooSmall,
        message: this._gtMessage ?? `Number must be greater than ${this._gt}`,
      });
    }
    if (this._lte !== undefined && value > this._lte) {
      ctx.addIssue({
        code: ErrorCode.TooBig,
        message: this._lteMessage ?? `Number must be less than or equal to ${this._lte}`,
      });
    }
    if (this._lt !== undefined && value >= this._lt) {
      ctx.addIssue({
        code: ErrorCode.TooBig,
        message: this._ltMessage ?? `Number must be less than ${this._lt}`,
      });
    }
    if (this._int && !Number.isInteger(value)) {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected integer, received float' });
    }
    if (this._positive && value <= 0) {
      ctx.addIssue({ code: ErrorCode.TooSmall, message: 'Number must be positive' });
    }
    if (this._negative && value >= 0) {
      ctx.addIssue({ code: ErrorCode.TooBig, message: 'Number must be negative' });
    }
    if (this._nonnegative && value < 0) {
      ctx.addIssue({ code: ErrorCode.TooSmall, message: 'Number must be nonnegative' });
    }
    if (this._nonpositive && value > 0) {
      ctx.addIssue({ code: ErrorCode.TooBig, message: 'Number must be nonpositive' });
    }
    if (this._multipleOf !== undefined && value % this._multipleOf !== 0) {
      ctx.addIssue({
        code: ErrorCode.NotMultipleOf,
        message: `Number must be a multiple of ${this._multipleOf}`,
      });
    }
    if (this._finite && !Number.isFinite(value)) {
      ctx.addIssue({ code: ErrorCode.NotFinite, message: 'Number must be finite' });
    }
    return value;
  }
  gte(n, message) {
    const clone = this._clone();
    clone._gte = n;
    clone._gteMessage = message;
    return clone;
  }
  min(n, message) {
    return this.gte(n, message);
  }
  gt(n, message) {
    const clone = this._clone();
    clone._gt = n;
    clone._gtMessage = message;
    return clone;
  }
  lte(n, message) {
    const clone = this._clone();
    clone._lte = n;
    clone._lteMessage = message;
    return clone;
  }
  max(n, message) {
    return this.lte(n, message);
  }
  lt(n, message) {
    const clone = this._clone();
    clone._lt = n;
    clone._ltMessage = message;
    return clone;
  }
  int() {
    const clone = this._clone();
    clone._int = true;
    return clone;
  }
  positive() {
    const clone = this._clone();
    clone._positive = true;
    return clone;
  }
  negative() {
    const clone = this._clone();
    clone._negative = true;
    return clone;
  }
  nonnegative() {
    const clone = this._clone();
    clone._nonnegative = true;
    return clone;
  }
  nonpositive() {
    const clone = this._clone();
    clone._nonpositive = true;
    return clone;
  }
  multipleOf(n) {
    const clone = this._clone();
    clone._multipleOf = n;
    return clone;
  }
  step(n) {
    return this.multipleOf(n);
  }
  finite() {
    const clone = this._clone();
    clone._finite = true;
    return clone;
  }
  _schemaType() {
    return SchemaType.Number;
  }
  _toJSONSchema(_tracker) {
    const schema = { type: this._int ? 'integer' : 'number' };
    if (this._gte !== undefined) schema.minimum = this._gte;
    if (this._gt !== undefined) schema.exclusiveMinimum = this._gt;
    if (this._lte !== undefined) schema.maximum = this._lte;
    if (this._lt !== undefined) schema.exclusiveMaximum = this._lt;
    if (this._multipleOf !== undefined) schema.multipleOf = this._multipleOf;
    return schema;
  }
  _clone() {
    const clone = this._cloneBase(new NumberSchema());
    clone._gte = this._gte;
    clone._gteMessage = this._gteMessage;
    clone._gt = this._gt;
    clone._gtMessage = this._gtMessage;
    clone._lte = this._lte;
    clone._lteMessage = this._lteMessage;
    clone._lt = this._lt;
    clone._ltMessage = this._ltMessage;
    clone._int = this._int;
    clone._positive = this._positive;
    clone._negative = this._negative;
    clone._nonnegative = this._nonnegative;
    clone._nonpositive = this._nonpositive;
    clone._multipleOf = this._multipleOf;
    clone._finite = this._finite;
    return clone;
  }
}
//# sourceMappingURL=number.js.map
