import type { EntityOperations } from './entity-operations';
import type { EntityDefinition } from './types';

export class EntityRegistry {
  private readonly entries = new Map<string, EntityOperations>();

  register(name: string, ops: EntityOperations): void {
    if (this.entries.has(name)) {
      throw new Error(`Entity "${name}" is already registered. Each entity name must be unique.`);
    }
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
      get: (_target, prop) => {
        // Ignore symbol access (e.g., Symbol.toPrimitive, Symbol.toStringTag)
        if (typeof prop === 'symbol') return undefined;
        return this.get(prop);
      },
    });
  }

  /**
   * Create a scoped Proxy limited to injected entities only.
   * Accessing a non-injected entity throws at runtime.
   */
  createScopedProxy(inject: Record<string, EntityDefinition>): Record<string, EntityOperations> {
    const localToEntity = new Map<string, string>();
    for (const [localName, def] of Object.entries(inject)) {
      localToEntity.set(localName, def.name);
    }

    return new Proxy({} as Record<string, EntityOperations>, {
      get: (_target, prop) => {
        if (typeof prop === 'symbol') return undefined;

        const entityName = localToEntity.get(prop);
        if (!entityName) {
          throw new Error(
            `Entity "${prop}" is not declared in inject. ` +
              `Injected entities: ${[...localToEntity.keys()].join(', ') || '(none)'}. ` +
              `Add it to the inject config to access it.`,
          );
        }
        return this.get(entityName);
      },
    });
  }
}
