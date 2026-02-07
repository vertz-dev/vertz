import { Schema } from '../core/schema';
import { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

export class InstanceOfSchema<T> extends Schema<T> {
  private readonly _cls: new (
    ...args: any[]
  ) => T;

  constructor(cls: new (...args: any[]) => T) {
    super();
    this._cls = cls;
  }

  _parse(value: unknown, ctx: ParseContext): T {
    if (!(value instanceof this._cls)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected instance of ${this._cls.name}`,
      });
      return value as T;
    }
    return value;
  }

  _schemaType(): SchemaType {
    return SchemaType.InstanceOf;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return {};
  }

  _clone(): InstanceOfSchema<T> {
    return this._cloneBase(new InstanceOfSchema(this._cls));
  }
}
