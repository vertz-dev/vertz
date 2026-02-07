import { Schema } from '../core/schema';
import type { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

type LiteralValue = string | number | boolean | null;

export class LiteralSchema<T extends LiteralValue> extends Schema<T> {
  private readonly _value: T;

  constructor(value: T) {
    super();
    this._value = value;
  }

  get value(): T {
    return this._value;
  }

  _parse(value: unknown, ctx: ParseContext): T {
    if (value !== this._value) {
      ctx.addIssue({
        code: ErrorCode.InvalidLiteral,
        message: `Expected ${JSON.stringify(this._value)}, received ${JSON.stringify(value)}`,
      });
    }
    return value as T;
  }

  _schemaType(): SchemaType {
    return SchemaType.Literal;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return { const: this._value };
  }

  _clone(): LiteralSchema<T> {
    return this._cloneBase(new LiteralSchema(this._value));
  }
}
