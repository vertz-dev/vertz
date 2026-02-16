import type { SchemaAny } from './schema';
export declare class SchemaRegistry {
  private static _schemas;
  static register(name: string, schema: SchemaAny): void;
  static get(name: string): SchemaAny | undefined;
  static getOrThrow(name: string): SchemaAny;
  static has(name: string): boolean;
  /** Returns a read-only view of the internal map. Do not cast to Map to mutate. */
  static getAll(): ReadonlyMap<string, SchemaAny>;
  static clear(): void;
}
//# sourceMappingURL=registry.d.ts.map
