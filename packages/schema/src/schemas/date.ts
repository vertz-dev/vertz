import { ErrorCode } from '../core/errors';
import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';

export class DateSchema extends Schema<Date> {
  private _min: Date | undefined;
  private _minMessage: string | undefined;
  private _max: Date | undefined;
  private _maxMessage: string | undefined;

  _parse(value: unknown, ctx: ParseContext): Date {
    if (!(value instanceof Date)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected Date, received ${typeof value}`,
      });
      return value as Date;
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

  min(date: Date, message?: string): DateSchema {
    const clone = this._clone();
    clone._min = date;
    clone._minMessage = message;
    return clone;
  }

  max(date: Date, message?: string): DateSchema {
    const clone = this._clone();
    clone._max = date;
    clone._maxMessage = message;
    return clone;
  }

  _schemaType(): SchemaType {
    return SchemaType.Date;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return { type: 'string', format: 'date-time' };
  }

  _clone(): DateSchema {
    const clone = this._cloneBase(new DateSchema());
    clone._min = this._min;
    clone._minMessage = this._minMessage;
    clone._max = this._max;
    clone._maxMessage = this._maxMessage;
    return clone;
  }
}
