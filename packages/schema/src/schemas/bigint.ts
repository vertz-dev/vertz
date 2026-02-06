import { Schema } from '../core/schema';
import { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

export class BigIntSchema extends Schema<bigint> {
  _parse(value: unknown, ctx: ParseContext): bigint {
    if (typeof value !== 'bigint') {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected bigint, received ' + typeof value });
      return value as bigint;
    }
    return value;
  }

  _schemaType(): SchemaType {
    return SchemaType.BigInt;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return { type: 'integer', format: 'int64' };
  }

  _clone(): BigIntSchema {
    return this._cloneBase(new BigIntSchema());
  }
}
