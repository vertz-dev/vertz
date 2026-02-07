import { ErrorCode } from '../core/errors';
import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';

export class CustomSchema<T> extends Schema<T> {
  private readonly _check: (value: unknown) => boolean;
  private readonly _message: string;

  constructor(check: (value: unknown) => boolean, message?: string) {
    super();
    this._check = check;
    this._message = message ?? 'Custom validation failed';
  }

  _parse(value: unknown, ctx: ParseContext): T {
    if (!this._check(value)) {
      ctx.addIssue({ code: ErrorCode.Custom, message: this._message });
    }
    return value as T;
  }

  _schemaType(): SchemaType {
    return SchemaType.Custom;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return {};
  }

  _clone(): CustomSchema<T> {
    return this._cloneBase(new CustomSchema(this._check, this._message));
  }
}
