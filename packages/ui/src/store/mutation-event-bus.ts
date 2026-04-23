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
  /**
   * Monotonic per-entity-type version that increments on every `emit()`.
   * Starts at 0 and never resets for a given bus instance.
   *
   * Used by `query()` to detect mutations that occurred while the query was
   * unsubscribed (e.g. the user navigated away and then came back). On
   * remount, cached data whose version snapshot predates the current
   * version must be considered stale and refetched.
   */
  getVersion(entityType: string): number;
  /** Remove all subscriptions. Used for SSR per-request isolation. */
  clear(): void;
}

/** Create a new MutationEventBus instance. */
export function createMutationEventBus(): MutationEventBus {
  const listeners = new Map<string, Set<() => void>>();
  const versions = new Map<string, number>();

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
      versions.set(entityType, (versions.get(entityType) ?? 0) + 1);
      const set = listeners.get(entityType);
      if (set) {
        // Snapshot to avoid re-entrancy issues if a callback unsubscribes during iteration.
        for (const cb of [...set]) cb();
      }
    },
    getVersion(entityType: string): number {
      return versions.get(entityType) ?? 0;
    },
    clear(): void {
      listeners.clear();
      versions.clear();
    },
  };
}
