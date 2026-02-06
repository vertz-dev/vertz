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
    return this._cloneBase(new AnySchema());
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
    return this._cloneBase(new UnknownSchema());
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
    return this._cloneBase(new NullSchema());
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
    return this._cloneBase(new UndefinedSchema());
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
    return this._cloneBase(new VoidSchema());
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
    return this._cloneBase(new NeverSchema());
  }
}
