import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class SymbolSchema extends Schema<symbol> {
  _parse(value: unknown, ctx: ParseContext): symbol;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): SymbolSchema;
}
//# sourceMappingURL=symbol.d.ts.map
