export class SchemaRegistry {
  private static _schemas = new Map<string, unknown>();

  static register(name: string, schema: unknown): void {
    this._schemas.set(name, schema);
  }

  static get(name: string): unknown | undefined {
    return this._schemas.get(name);
  }

  static has(name: string): boolean {
    return this._schemas.has(name);
  }

  static getAll(): ReadonlyMap<string, unknown> {
    return this._schemas;
  }

  static clear(): void {
    this._schemas.clear();
  }
}
