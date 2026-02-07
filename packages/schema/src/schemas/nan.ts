import { ErrorCode } from '../core/errors';
import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';

export class NanSchema extends Schema<number> {
  _parse(value: unknown, ctx: ParseContext): number {
    if (typeof value !== 'number' || !Number.isNaN(value)) {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected NaN' });
      return value as number;
    }
    return value;
  }

  _schemaType(): SchemaType {
    return SchemaType.NaN;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return { not: {} };
  }

  _clone(): NanSchema {
    return this._cloneBase(new NanSchema());
  }
}
