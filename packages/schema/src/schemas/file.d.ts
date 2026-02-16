import type { ParseContext } from '../core/parse-context';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
import type { JSONSchemaObject, RefTracker } from '../introspection/json-schema';
export declare class FileSchema extends Schema<Blob> {
  _parse(value: unknown, ctx: ParseContext): Blob;
  _schemaType(): SchemaType;
  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject;
  _clone(): FileSchema;
}
//# sourceMappingURL=file.d.ts.map
