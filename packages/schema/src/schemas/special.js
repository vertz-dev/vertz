import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
// biome-ignore lint/suspicious/noExplicitAny: AnySchema intentionally models the any type
export class AnySchema extends Schema {
  // biome-ignore lint/suspicious/noExplicitAny: AnySchema intentionally returns any
  _parse(value, _ctx) {
    return value;
  }
  _schemaType() {
    return SchemaType.Any;
  }
  _toJSONSchema(_tracker) {
    return {};
  }
  _clone() {
    return this._cloneBase(new AnySchema());
  }
}
export class UnknownSchema extends Schema {
  _parse(value, _ctx) {
    return value;
  }
  _schemaType() {
    return SchemaType.Unknown;
  }
  _toJSONSchema(_tracker) {
    return {};
  }
  _clone() {
    return this._cloneBase(new UnknownSchema());
  }
}
export class NullSchema extends Schema {
  _parse(value, ctx) {
    if (value !== null) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected null, received ${typeof value}`,
      });
      return null;
    }
    return value;
  }
  _schemaType() {
    return SchemaType.Null;
  }
  _toJSONSchema(_tracker) {
    return { type: 'null' };
  }
  _clone() {
    return this._cloneBase(new NullSchema());
  }
}
export class UndefinedSchema extends Schema {
  _parse(value, ctx) {
    if (value !== undefined) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected undefined, received ${typeof value}`,
      });
      return undefined;
    }
    return value;
  }
  _schemaType() {
    return SchemaType.Undefined;
  }
  _toJSONSchema(_tracker) {
    return {};
  }
  _clone() {
    return this._cloneBase(new UndefinedSchema());
  }
}
export class VoidSchema extends Schema {
  _parse(value, ctx) {
    if (value !== undefined) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected void (undefined), received ${typeof value}`,
      });
    }
  }
  _schemaType() {
    return SchemaType.Void;
  }
  _toJSONSchema(_tracker) {
    return {};
  }
  _clone() {
    return this._cloneBase(new VoidSchema());
  }
}
export class NeverSchema extends Schema {
  _parse(value, ctx) {
    ctx.addIssue({ code: ErrorCode.InvalidType, message: 'No value is allowed' });
    return value;
  }
  _schemaType() {
    return SchemaType.Never;
  }
  _toJSONSchema(_tracker) {
    return { not: {} };
  }
  _clone() {
    return this._cloneBase(new NeverSchema());
  }
}
//# sourceMappingURL=special.js.map
