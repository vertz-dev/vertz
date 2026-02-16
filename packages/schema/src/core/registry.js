// biome-ignore lint/complexity/noStaticOnlyClass: registry pattern — class groups related operations under a namespace
export class SchemaRegistry {
  static _schemas = new Map();
  static register(name, schema) {
    SchemaRegistry._schemas.set(name, schema);
  }
  static get(name) {
    return SchemaRegistry._schemas.get(name);
  }
  static getOrThrow(name) {
    const schema = SchemaRegistry._schemas.get(name);
    if (!schema) {
      throw new Error(`Schema "${name}" not found in registry`);
    }
    return schema;
  }
  static has(name) {
    return SchemaRegistry._schemas.has(name);
  }
  /** Returns a read-only view of the internal map. Do not cast to Map to mutate. */
  static getAll() {
    return SchemaRegistry._schemas;
  }
  static clear() {
    SchemaRegistry._schemas.clear();
  }
}
//# sourceMappingURL=registry.js.map
