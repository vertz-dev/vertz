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
    return this._cloneBase(new BooleanSchema());
  }
}
