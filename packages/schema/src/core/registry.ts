import type { SchemaAny } from './schema';

// biome-ignore lint/complexity/noStaticOnlyClass: registry pattern — class groups related operations under a namespace
export class SchemaRegistry {
  private static _schemas = new Map<string, SchemaAny>();

  static register(name: string, schema: SchemaAny): void {
    SchemaRegistry._schemas.set(name, schema);
  }

  static get(name: string): SchemaAny | undefined {
    return SchemaRegistry._schemas.get(name);
  }

  static getOrThrow(name: string): SchemaAny {
    const schema = SchemaRegistry._schemas.get(name);
    if (!schema) {
      throw new Error(`Schema "${name}" not found in registry`);
    }
    return schema;
  }

  static has(name: string): boolean {
    return SchemaRegistry._schemas.has(name);
  }

  /** Returns a read-only view of the internal map. Do not cast to Map to mutate. */
  static getAll(): ReadonlyMap<string, SchemaAny> {
    return SchemaRegistry._schemas;
  }

  static clear(): void {
    SchemaRegistry._schemas.clear();
  }
}
