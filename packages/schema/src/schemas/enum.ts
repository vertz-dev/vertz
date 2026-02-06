import { Schema } from '../core/schema';
import { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

export class EnumSchema<T extends readonly [string, ...string[]]> extends Schema<T[number]> {
  private readonly _values: T;

  constructor(values: T) {
    super();
    this._values = values;
  }

  _parse(value: unknown, ctx: ParseContext): T[number] {
    if (!this._values.includes(value as string)) {
      ctx.addIssue({
        code: ErrorCode.InvalidEnumValue,
        message: `Invalid enum value. Expected ${this._values.map(v => `'${v}'`).join(' | ')}, received '${value}'`,
      });
    }
    return value as T[number];
  }

  _schemaType(): SchemaType {
    return SchemaType.Enum;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return { enum: [...this._values] };
  }

  exclude<E extends T[number]>(values: E[]): EnumSchema<readonly [string, ...string[]]> {
    const remaining = this._values.filter(v => !(values as string[]).includes(v)) as unknown as [string, ...string[]];
    const schema = new EnumSchema(remaining);
    return this._cloneBase(schema);
  }

  extract<E extends T[number]>(values: E[]): EnumSchema<readonly [string, ...string[]]> {
    const schema = new EnumSchema(values as unknown as [string, ...string[]]);
    return this._cloneBase(schema);
  }

  _clone(): EnumSchema<T> {
    return this._cloneBase(new EnumSchema(this._values));
  }
}
