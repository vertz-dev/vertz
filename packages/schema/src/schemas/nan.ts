import { Schema } from '../core/schema';
import { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

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
    return {};
  }

  _clone(): NanSchema {
    const clone = new NanSchema();
    clone._id = this._id;
    clone._description = this._description;
    clone._meta = this._meta ? { ...this._meta } : undefined;
    clone._examples = [...this._examples];
    return clone;
  }
}
