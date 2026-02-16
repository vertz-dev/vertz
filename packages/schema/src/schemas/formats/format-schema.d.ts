import type { ParseContext } from '../../core/parse-context';
import type { JSONSchemaObject, RefTracker } from '../../introspection/json-schema';
import { StringSchema } from '../string';
export declare abstract class FormatSchema extends StringSchema {
  protected abstract _errorMessage: string;
  protected abstract _validate(value: string): boolean;
  protected _jsonSchemaExtra(): Record<string, unknown> | undefined;
  _parse(value: unknown, ctx: ParseContext): string;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): this;
}
//# sourceMappingURL=format-schema.d.ts.map
