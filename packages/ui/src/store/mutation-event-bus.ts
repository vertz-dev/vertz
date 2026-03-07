/**
 * MutationEventBus — simple pub/sub for same-type query revalidation.
 *
 * When a mutation commits, the handler emits the mutated entity type.
 * Queries subscribed to that entity type revalidate automatically.
 */
export interface MutationEventBus {
  /** Subscribe to mutation events for a specific entity type. Returns unsubscribe function. */
  subscribe(entityType: string, callback: () => void): () => void;
  /** Emit a mutation event for an entity type. All subscribers for that type are notified. */
  emit(entityType: string): void;
  /** Remove all subscriptions. Used for SSR per-request isolation. */
  clear(): void;
}

/** Create a new MutationEventBus instance. */
export function createMutationEventBus(): MutationEventBus {
  const listeners = new Map<string, Set<() => void>>();

  return {
    subscribe(entityType: string, callback: () => void): () => void {
      let set = listeners.get(entityType);
      if (!set) {
        set = new Set();
        listeners.set(entityType, set);
      }
      set.add(callback);
      return () => set?.delete(callback);
    },
    emit(entityType: string): void {
      const set = listeners.get(entityType);
      if (set) {
        for (const cb of set) cb();
      }
    },
    clear(): void {
      listeners.clear();
    },
  };
}
