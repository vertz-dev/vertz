import { Schema } from '../core/schema';
import { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

export class BooleanSchema extends Schema<boolean> {
  _parse(value: unknown, ctx: ParseContext): boolean {
    if (typeof value !== 'boolean') {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected boolean, received ' + typeof value });
      return value as boolean;
    }
    return value;
  }

  _schemaType(): SchemaType {
    return SchemaType.Boolean;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return { type: 'boolean' };
  }

  _clone(): BooleanSchema {
    const clone = new BooleanSchema();
    clone._id = this._id;
    clone._description = this._description;
    clone._meta = this._meta ? { ...this._meta } : undefined;
    clone._examples = [...this._examples];
    return clone;
  }
}
