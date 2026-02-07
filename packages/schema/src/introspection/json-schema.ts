import type { SchemaAny } from '../core/schema';

export interface JSONSchemaObject {
  [key: string]: unknown;
}

export class RefTracker {
  private _seen = new Set<string>();
  private _defs: Record<string, JSONSchemaObject> = {};

  hasSeen(id: string): boolean {
    return this._seen.has(id);
  }

  markSeen(id: string): void {
    this._seen.add(id);
  }

  addDef(id: string, schema: JSONSchemaObject): void {
    this._defs[id] = schema;
  }

  getDefs(): Record<string, JSONSchemaObject> {
    return { ...this._defs };
  }
}

export function toJSONSchema(schema: SchemaAny): JSONSchemaObject {
  return schema.toJSONSchema();
}
