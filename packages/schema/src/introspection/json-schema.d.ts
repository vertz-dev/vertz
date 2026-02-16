import type { SchemaAny } from '../core/schema';
export interface JSONSchemaObject {
  [key: string]: unknown;
}
export declare class RefTracker {
  private _seen;
  private _defs;
  hasSeen(id: string): boolean;
  markSeen(id: string): void;
  addDef(id: string, schema: JSONSchemaObject): void;
  getDefs(): Record<string, JSONSchemaObject>;
}
export declare function toJSONSchema(schema: SchemaAny): JSONSchemaObject;
//# sourceMappingURL=json-schema.d.ts.map
