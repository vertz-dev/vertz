import type { SchemaAny } from './schema';

export class SchemaRegistry {
  private static _schemas = new Map<string, SchemaAny>();

  static register(name: string, schema: SchemaAny): void {
    this._schemas.set(name, schema);
  }

  static get(name: string): SchemaAny | undefined {
    return this._schemas.get(name);
  }

  static getOrThrow(name: string): SchemaAny {
    const schema = this._schemas.get(name);
    if (!schema) {
      throw new Error(`Schema "${name}" not found in registry`);
    }
    return schema;
  }

  static has(name: string): boolean {
    return this._schemas.has(name);
  }

  /** Returns a read-only view of the internal map. Do not cast to Map to mutate. */
  static getAll(): ReadonlyMap<string, SchemaAny> {
    return this._schemas;
  }

  static clear(): void {
    this._schemas.clear();
  }
}
