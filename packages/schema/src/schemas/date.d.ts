import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class DateSchema extends Schema<Date> {
  private _min;
  private _minMessage;
  private _max;
  private _maxMessage;
  _parse(value: unknown, ctx: ParseContext): Date;
  min(date: Date, message?: string): DateSchema;
  max(date: Date, message?: string): DateSchema;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): DateSchema;
}
//# sourceMappingURL=date.d.ts.map
