import { Schema } from '../core/schema';
import { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

export class SymbolSchema extends Schema<symbol> {
  _parse(value: unknown, ctx: ParseContext): symbol {
    if (typeof value !== 'symbol') {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: 'Expected symbol, received ' + typeof value,
      });
      return value as symbol;
    }
    return value;
  }

  _schemaType(): SchemaType {
    return SchemaType.Symbol;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return { not: {} };
  }

  _clone(): SymbolSchema {
    return this._cloneBase(new SymbolSchema());
  }
}
