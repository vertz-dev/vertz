import { ErrorCode } from '../core/errors';
import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';

// biome-ignore lint/suspicious/noExplicitAny: standard TS pattern for any-constructor constraint
type Constructor<T> = new (...args: any[]) => T;

export class InstanceOfSchema<T> extends Schema<T> {
  private readonly _cls: Constructor<T>;

  constructor(cls: Constructor<T>) {
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
