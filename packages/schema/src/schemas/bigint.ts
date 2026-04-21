import { ErrorCode } from '../core/errors';
import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';

export class BigIntSchema extends Schema<bigint> {
  private _invalidTypeMessage: string | undefined;

  _parse(value: unknown, ctx: ParseContext): bigint {
    if (typeof value !== 'bigint') {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: this._invalidTypeMessage ?? 'Must be an integer',
      });
      return value as bigint;
    }
    return value;
  }

  message(msg: string): BigIntSchema {
    const clone = this._clone();
    clone._invalidTypeMessage = msg;
    return clone;
  }

  _schemaType(): SchemaType {
    return SchemaType.BigInt;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return { type: 'integer', format: 'int64' };
  }

  _clone(): BigIntSchema {
    const clone = this._cloneBase(new BigIntSchema());
    clone._invalidTypeMessage = this._invalidTypeMessage;
    return clone;
  }
}
