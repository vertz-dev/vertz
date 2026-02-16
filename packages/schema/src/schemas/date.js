import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class DateSchema extends Schema {
  _min;
  _minMessage;
  _max;
  _maxMessage;
  _parse(value, ctx) {
    if (!(value instanceof Date)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected Date, received ${typeof value}`,
      });
      return value;
    }
    if (Number.isNaN(value.getTime())) {
      ctx.addIssue({ code: ErrorCode.InvalidDate, message: 'Invalid date' });
      return value;
    }
    if (this._min !== undefined && value.getTime() < this._min.getTime()) {
      ctx.addIssue({
        code: ErrorCode.TooSmall,
        message: this._minMessage ?? `Date must be after ${this._min.toISOString()}`,
      });
    }
    if (this._max !== undefined && value.getTime() > this._max.getTime()) {
      ctx.addIssue({
        code: ErrorCode.TooBig,
        message: this._maxMessage ?? `Date must be before ${this._max.toISOString()}`,
      });
    }
    return value;
  }
  min(date, message) {
    const clone = this._clone();
    clone._min = date;
    clone._minMessage = message;
    return clone;
  }
  max(date, message) {
    const clone = this._clone();
    clone._max = date;
    clone._maxMessage = message;
    return clone;
  }
  _schemaType() {
    return SchemaType.Date;
  }
  _toJSONSchema(_tracker) {
    return { type: 'string', format: 'date-time' };
  }
  _clone() {
    const clone = this._cloneBase(new DateSchema());
    clone._min = this._min;
    clone._minMessage = this._minMessage;
    clone._max = this._max;
    clone._maxMessage = this._maxMessage;
    return clone;
  }
}
//# sourceMappingURL=date.js.map
