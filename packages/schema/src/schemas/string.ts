import { ErrorCode } from '../core/errors';
import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';

export class StringSchema extends Schema<string> {
  private _min: number | undefined;
  private _minMessage: string | undefined;
  private _max: number | undefined;
  private _maxMessage: string | undefined;
  private _length: number | undefined;
  private _lengthMessage: string | undefined;
  private _regex: RegExp | undefined;
  private _startsWith: string | undefined;
  private _endsWith: string | undefined;
  private _includes: string | undefined;
  private _uppercase: boolean = false;
  private _lowercase: boolean = false;
  private _trim: boolean = false;
  private _toLowerCase: boolean = false;
  private _toUpperCase: boolean = false;
  private _normalize: boolean = false;

  _parse(value: unknown, ctx: ParseContext): string {
    if (typeof value !== 'string') {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected string, received ${typeof value}`,
      });
      return value as string;
    }
    let v = value;
    if (this._trim) {
      v = v.trim();
    }
    if (this._toLowerCase) {
      v = v.toLowerCase();
    }
    if (this._toUpperCase) {
      v = v.toUpperCase();
    }
    if (this._normalize) {
      v = v.normalize();
    }
    if (this._min !== undefined && v.length < this._min) {
      ctx.addIssue({
        code: ErrorCode.TooSmall,
        message: this._minMessage ?? `String must contain at least ${this._min} character(s)`,
      });
    }
    if (this._max !== undefined && v.length > this._max) {
      ctx.addIssue({
        code: ErrorCode.TooBig,
        message: this._maxMessage ?? `String must contain at most ${this._max} character(s)`,
      });
    }
    if (this._length !== undefined && v.length !== this._length) {
      ctx.addIssue({
        code: ErrorCode.InvalidString,
        message: this._lengthMessage ?? `String must be exactly ${this._length} character(s)`,
      });
    }
    if (this._regex !== undefined && !this._regex.test(v)) {
      ctx.addIssue({
        code: ErrorCode.InvalidString,
        message: `Invalid: must match ${this._regex}`,
      });
    }
    if (this._startsWith !== undefined && !v.startsWith(this._startsWith)) {
      ctx.addIssue({
        code: ErrorCode.InvalidString,
        message: `Invalid input: must start with "${this._startsWith}"`,
      });
    }
    if (this._endsWith !== undefined && !v.endsWith(this._endsWith)) {
      ctx.addIssue({
        code: ErrorCode.InvalidString,
        message: `Invalid input: must end with "${this._endsWith}"`,
      });
    }
    if (this._includes !== undefined && !v.includes(this._includes)) {
      ctx.addIssue({
        code: ErrorCode.InvalidString,
        message: `Invalid input: must include "${this._includes}"`,
      });
    }
    if (this._uppercase && v !== v.toUpperCase()) {
      ctx.addIssue({ code: ErrorCode.InvalidString, message: 'Expected string to be uppercase' });
    }
    if (this._lowercase && v !== v.toLowerCase()) {
      ctx.addIssue({ code: ErrorCode.InvalidString, message: 'Expected string to be lowercase' });
    }
    return v;
  }

  min(n: number, message?: string): StringSchema {
    const clone = this._clone();
    clone._min = n;
    clone._minMessage = message;
    return clone;
  }

  max(n: number, message?: string): StringSchema {
    const clone = this._clone();
    clone._max = n;
    clone._maxMessage = message;
    return clone;
  }

  length(n: number, message?: string): StringSchema {
    const clone = this._clone();
    clone._length = n;
    clone._lengthMessage = message;
    return clone;
  }

  regex(pattern: RegExp): StringSchema {
    const clone = this._clone();
    clone._regex = pattern;
    return clone;
  }

  startsWith(prefix: string): StringSchema {
    const clone = this._clone();
    clone._startsWith = prefix;
    return clone;
  }

  endsWith(suffix: string): StringSchema {
    const clone = this._clone();
    clone._endsWith = suffix;
    return clone;
  }

  includes(substring: string): StringSchema {
    const clone = this._clone();
    clone._includes = substring;
    return clone;
  }

  uppercase(): StringSchema {
    const clone = this._clone();
    clone._uppercase = true;
    return clone;
  }

  lowercase(): StringSchema {
    const clone = this._clone();
    clone._lowercase = true;
    return clone;
  }

  trim(): StringSchema {
    const clone = this._clone();
    clone._trim = true;
    return clone;
  }

  toLowerCase(): StringSchema {
    const clone = this._clone();
    clone._toLowerCase = true;
    return clone;
  }

  toUpperCase(): StringSchema {
    const clone = this._clone();
    clone._toUpperCase = true;
    return clone;
  }

  normalize(): StringSchema {
    const clone = this._clone();
    clone._normalize = true;
    return clone;
  }

  _schemaType(): SchemaType {
    return SchemaType.String;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    const schema: JSONSchemaObject = { type: 'string' };
    if (this._min !== undefined) schema.minLength = this._min;
    if (this._max !== undefined) schema.maxLength = this._max;
    if (this._regex !== undefined) schema.pattern = this._regex.source;
    return schema;
  }

  _clone(): StringSchema {
    const clone = this._cloneBase(new StringSchema());
    clone._min = this._min;
    clone._minMessage = this._minMessage;
    clone._max = this._max;
    clone._maxMessage = this._maxMessage;
    clone._length = this._length;
    clone._lengthMessage = this._lengthMessage;
    clone._regex = this._regex;
    clone._startsWith = this._startsWith;
    clone._endsWith = this._endsWith;
    clone._includes = this._includes;
    clone._uppercase = this._uppercase;
    clone._lowercase = this._lowercase;
    clone._trim = this._trim;
    clone._toLowerCase = this._toLowerCase;
    clone._toUpperCase = this._toUpperCase;
    clone._normalize = this._normalize;
    return clone;
  }
}
