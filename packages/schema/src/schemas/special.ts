import { Schema } from '../core/schema';
import { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

export class AnySchema extends Schema<any> {
  _parse(value: unknown, _ctx: ParseContext): any {
    return value;
  }

  _schemaType(): SchemaType {
    return SchemaType.Any;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return {};
  }

  _clone(): AnySchema {
    const clone = new AnySchema();
    clone._id = this._id;
    clone._description = this._description;
    clone._meta = this._meta ? { ...this._meta } : undefined;
    clone._examples = [...this._examples];
    return clone;
  }
}

export class UnknownSchema extends Schema<unknown> {
  _parse(value: unknown, _ctx: ParseContext): unknown {
    return value;
  }

  _schemaType(): SchemaType {
    return SchemaType.Unknown;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return {};
  }

  _clone(): UnknownSchema {
    const clone = new UnknownSchema();
    clone._id = this._id;
    clone._description = this._description;
    clone._meta = this._meta ? { ...this._meta } : undefined;
    clone._examples = [...this._examples];
    return clone;
  }
}

export class NullSchema extends Schema<null> {
  _parse(value: unknown, ctx: ParseContext): null {
    if (value !== null) {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected null, received ' + typeof value });
      return value as null;
    }
    return value;
  }

  _schemaType(): SchemaType {
    return SchemaType.Null;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return { type: 'null' };
  }

  _clone(): NullSchema {
    const clone = new NullSchema();
    clone._id = this._id;
    clone._description = this._description;
    clone._meta = this._meta ? { ...this._meta } : undefined;
    clone._examples = [...this._examples];
    return clone;
  }
}

export class UndefinedSchema extends Schema<undefined> {
  _parse(value: unknown, ctx: ParseContext): undefined {
    if (value !== undefined) {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected undefined, received ' + typeof value });
      return value as undefined;
    }
    return value;
  }

  _schemaType(): SchemaType {
    return SchemaType.Undefined;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return {};
  }

  _clone(): UndefinedSchema {
    const clone = new UndefinedSchema();
    clone._id = this._id;
    clone._description = this._description;
    clone._meta = this._meta ? { ...this._meta } : undefined;
    clone._examples = [...this._examples];
    return clone;
  }
}

export class VoidSchema extends Schema<void> {
  _parse(value: unknown, ctx: ParseContext): void {
    if (value !== undefined) {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected void (undefined), received ' + typeof value });
      return value as void;
    }
    return value;
  }

  _schemaType(): SchemaType {
    return SchemaType.Void;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return {};
  }

  _clone(): VoidSchema {
    const clone = new VoidSchema();
    clone._id = this._id;
    clone._description = this._description;
    clone._meta = this._meta ? { ...this._meta } : undefined;
    clone._examples = [...this._examples];
    return clone;
  }
}

export class NeverSchema extends Schema<never> {
  _parse(value: unknown, ctx: ParseContext): never {
    ctx.addIssue({ code: ErrorCode.InvalidType, message: 'No value is allowed' });
    return value as never;
  }

  _schemaType(): SchemaType {
    return SchemaType.Never;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return { not: {} };
  }

  _clone(): NeverSchema {
    const clone = new NeverSchema();
    clone._id = this._id;
    clone._description = this._description;
    clone._meta = this._meta ? { ...this._meta } : undefined;
    clone._examples = [...this._examples];
    return clone;
  }
}
