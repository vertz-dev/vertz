import type { EntityOperations } from './entity-operations';

export class EntityRegistry {
  private readonly entries = new Map<string, EntityOperations>();

  register(name: string, ops: EntityOperations): void {
    this.entries.set(name, ops);
  }

  get(name: string): EntityOperations {
    const entry = this.entries.get(name);
    if (!entry) {
      const available = [...this.entries.keys()].join(', ');
      throw new Error(`Entity "${name}" is not registered. Available entities: ${available}`);
    }
    return entry;
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** Create a Proxy for dot-access: proxy.users.get(id) */
  createProxy(): Record<string, EntityOperations> {
    return new Proxy({} as Record<string, EntityOperations>, {
      get: (_target, prop: string) => this.get(prop),
    });
  }
}
