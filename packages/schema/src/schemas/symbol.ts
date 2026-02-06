import { Schema } from '../core/schema';
import { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

export class SymbolSchema extends Schema<symbol> {
  _parse(value: unknown, ctx: ParseContext): symbol {
    if (typeof value !== 'symbol') {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected symbol, received ' + typeof value });
      return value as symbol;
    }
    return value;
  }

  _schemaType(): SchemaType {
    return SchemaType.Symbol;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return {};
  }

  _clone(): SymbolSchema {
    const clone = new SymbolSchema();
    clone._id = this._id;
    clone._description = this._description;
    clone._meta = this._meta ? { ...this._meta } : undefined;
    clone._examples = [...this._examples];
    return clone;
  }
}
