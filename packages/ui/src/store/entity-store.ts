import { batch } from '../runtime/scheduler';
import { computed, signal } from '../runtime/signal';
import type { ReadonlySignal, Signal } from '../runtime/signal-types';
import { untrack } from '../runtime/tracking';
import { shallowEqual, shallowMerge } from './merge';
import { normalizeEntity } from './normalize';
import { QueryResultIndex } from './query-result-index';
import type { EntityStoreOptions, SerializedStore } from './types';

/**
 * Internal entry for each entity in the store.
 * Supports optimistic layer stack for concurrent mutations.
 */
interface EntityEntry {
  /** The reactive signal exposed to consumers — always reflects visible state. */
  signal: Signal<any>;
  /** Server-confirmed ground truth. */
  base: Record<string, unknown>;
  /** Optimistic layers keyed by mutation ID. Inserted order preserved by Map. */
  layers: Map<string, Record<string, unknown>>;
  /** Number of active queries referencing this entity. */
  refCount: number;
  /** Timestamp when refCount dropped to 0, or null if still referenced. */
  orphanedAt: number | null;
}

/**
 * EntityStore - Normalized, signal-backed entity cache for @vertz/ui.
 *
 * Stores entities by type and ID, with signal-per-entity reactivity.
 * Supports field-level merge, SSR hydration, optimistic layers, and query result indices.
 */
export class EntityStore {
  private _entities = new Map<string, Map<string, EntityEntry>>();
  private _typeListeners = new Map<string, Set<() => void>>();
  private _queryIndices = new QueryResultIndex();

  /** Public accessor for query indices — used by optimistic handlers and tests. */
  get queryIndices(): QueryResultIndex {
    return this._queryIndices;
  }

  constructor(options?: EntityStoreOptions) {
    if (options?.initialData) {
      this.hydrate(options.initialData);
    }
  }

  /**
   * Read a single entity. Returns a signal that updates on merge.
   * Returns the same signal instance on repeated calls (identity stability).
   */
  get<T>(type: string, id: string): ReadonlySignal<T | undefined> {
    const typeMap = this._entities.get(type);
    const entry = typeMap?.get(id);

    if (entry) {
      return entry.signal as ReadonlySignal<T | undefined>;
    }

    // Create undefined entry for missing entity (allows reactive queries to work)
    const sig = signal<T | undefined>(undefined);
    const newEntry: EntityEntry = {
      signal: sig,
      base: {},
      layers: new Map(),
      refCount: 0,
      orphanedAt: null,
    };
    this._getOrCreateTypeMap(type).set(id, newEntry);
    return sig as ReadonlySignal<T | undefined>;
  }

  /**
   * Read multiple entities by IDs. Returns a computed signal of the array.
   * Returns a NEW computed signal each call (not cached).
   */
  getMany<T>(type: string, ids: string[]): ReadonlySignal<(T | undefined)[]> {
    return computed(() => ids.map((id) => this.get<T>(type, id).value));
  }

  /**
   * Merge one or more entities into the store.
   * Field-level merge with shallow diff - only updates signals if data changed.
   * Uses batch() to coalesce multiple updates into single reactive flush.
   * Uses untrack() to prevent circular re-triggering when called from effects.
   */
  merge<T extends { id: string }>(type: string, data: T | T[]): void {
    const items = Array.isArray(data) ? data : [data];

    if (items.length === 0) {
      return; // no-op for empty array
    }

    batch(() => {
      for (const item of items) {
        const { normalized, extracted } = normalizeEntity(type, item as Record<string, unknown>);

        // Merge extracted nested entities first
        for (const [nestedType, nestedItems] of extracted) {
          for (const nestedItem of nestedItems) {
            this._mergeOne(nestedType, nestedItem);
          }
        }

        // Then merge the normalized parent
        this._mergeOne(type, normalized);
      }
    });
  }

  /**
   * Remove an entity from the store.
   * Triggers type change listeners and removes from query indices.
   */
  remove(type: string, id: string): void {
    const typeMap = this._entities.get(type);

    if (!typeMap?.has(id)) {
      return; // no-op for missing entity
    }

    // Set signal to undefined before deleting
    const entry = typeMap.get(id);
    if (entry) {
      entry.signal.value = undefined;
    }

    typeMap.delete(id);

    // Clean up query indices
    this._queryIndices.removeEntity(id);

    // Notify type change listeners
    this._notifyTypeChange(type);
  }

  /**
   * Subscribe to type-level changes (create/delete, not field updates).
   * Returns an unsubscribe function.
   */
  onTypeChange(type: string, callback: () => void): () => void {
    const listeners = this._getOrCreateListeners(type);
    listeners.add(callback);

    return () => {
      listeners.delete(callback);
    };
  }

  /**
   * Check if an entity exists in the store.
   */
  has(type: string, id: string): boolean {
    const typeMap = this._entities.get(type);
    if (!typeMap?.has(id)) {
      return false;
    }

    const entry = typeMap.get(id);
    return entry?.signal.peek() !== undefined;
  }

  /**
   * Get count of entities for a type.
   */
  size(type: string): number {
    const typeMap = this._entities.get(type);
    if (!typeMap) {
      return 0;
    }

    // Count only entities with non-undefined values
    let count = 0;
    for (const entry of typeMap.values()) {
      if (entry.signal.peek() !== undefined) {
        count++;
      }
    }
    return count;
  }

  /**
   * Serialize the store for SSR transfer.
   * Serializes base values only — optimistic layers are transient.
   */
  dehydrate(): SerializedStore {
    const entities: Record<string, Record<string, unknown>> = {};

    for (const [type, typeMap] of this._entities.entries()) {
      const typeEntities: Record<string, unknown> = {};

      for (const [id, entry] of typeMap.entries()) {
        // Serialize base values only — layers are transient (in-flight mutations).
        if (entry.base !== undefined) {
          typeEntities[id] = entry.base;
        }
      }

      if (Object.keys(typeEntities).length > 0) {
        entities[type] = typeEntities;
      }
    }

    const queries: Record<string, { ids: string[] }> = {};
    for (const queryKey of this._queryIndices.keys()) {
      const ids = this._queryIndices.get(queryKey);
      if (ids) {
        queries[queryKey] = { ids };
      }
    }

    return {
      entities,
      ...(Object.keys(queries).length > 0 ? { queries } : {}),
    };
  }

  /**
   * Hydrate from serialized data. Merges into existing store (doesn't replace).
   */
  hydrate(data: SerializedStore): void {
    // Hydrate entities
    for (const [type, typeEntities] of Object.entries(data.entities)) {
      const entities = Object.values(typeEntities).map(
        (entity) => entity as Record<string, unknown> & { id: string },
      );
      this.merge(type, entities);
    }

    // Hydrate query indices
    if (data.queries) {
      for (const [queryKey, queryData] of Object.entries(data.queries)) {
        this._queryIndices.set(queryKey, queryData.ids);
      }
    }
  }

  /**
   * Apply an optimistic layer to an entity.
   * The layer is stacked on top of base, recomputing the visible signal value.
   */
  applyLayer(type: string, id: string, mutationId: string, patch: Record<string, unknown>): void {
    const entry = this._entities.get(type)?.get(id);
    if (!entry) return;

    entry.layers.set(mutationId, patch);
    this._recomputeVisible(entry);
  }

  /**
   * Increment the reference count for an entity.
   * Clears orphanedAt timestamp. No-op if entity doesn't exist.
   */
  addRef(type: string, id: string): void {
    const entry = this._entities.get(type)?.get(id);
    if (!entry) return;

    entry.refCount++;
    entry.orphanedAt = null;
  }

  /**
   * Decrement the reference count for an entity.
   * Sets orphanedAt when refCount reaches 0. No-op if entity doesn't exist.
   */
  removeRef(type: string, id: string): void {
    const entry = this._entities.get(type)?.get(id);
    if (!entry) return;

    if (entry.refCount > 0) {
      entry.refCount--;
    }
    if (entry.refCount === 0) {
      entry.orphanedAt = Date.now();
    }
  }

  /**
   * Evict orphaned entities (refCount=0) that have been unreferenced
   * for longer than maxAge ms. Entities with pending layers are preserved.
   * Default maxAge: 5 minutes.
   */
  evictOrphans(maxAge = 300_000): number {
    const now = Date.now();
    let count = 0;

    for (const [_type, typeMap] of this._entities) {
      for (const [id, entry] of typeMap) {
        if (
          entry.refCount === 0 &&
          entry.orphanedAt !== null &&
          now - entry.orphanedAt >= maxAge &&
          entry.layers.size === 0
        ) {
          entry.signal.value = undefined;
          typeMap.delete(id);
          this._queryIndices.removeEntity(id);
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Inspect the internal state of an entity — for debugging and testing.
   * Returns base, layers, visible (computed) state, refCount, and orphanedAt.
   */
  inspect(
    type: string,
    id: string,
  ):
    | {
        base: Record<string, unknown>;
        layers: Map<string, Record<string, unknown>>;
        visible: unknown;
        refCount: number;
        orphanedAt: number | null;
      }
    | undefined {
    const entry = this._entities.get(type)?.get(id);
    if (!entry) return undefined;

    return {
      base: entry.base,
      layers: entry.layers,
      visible: entry.signal.peek(),
      refCount: entry.refCount,
      orphanedAt: entry.orphanedAt,
    };
  }

  /**
   * Rollback an optimistic layer (mutation failed).
   * Removes the layer and recomputes visible from base + remaining layers.
   */
  rollbackLayer(type: string, id: string, mutationId: string): void {
    const entry = this._entities.get(type)?.get(id);
    if (!entry) return;

    entry.layers.delete(mutationId);
    this._recomputeVisible(entry);
  }

  /**
   * Optimistically remove an entity (for delete mutations).
   * Removes the entity from the store and query indices.
   * Caller should snapshot entity + indices beforehand for rollback.
   */
  removeOptimistic(type: string, id: string, _mutationId: string): void {
    this.remove(type, id);
  }

  /**
   * Restore an entity after a failed optimistic delete.
   * Re-merges the entity and restores query index positions.
   */
  restoreOptimistic(
    type: string,
    _id: string,
    _mutationId: string,
    entitySnapshot: unknown,
    indexSnapshot: Map<string, string[]>,
  ): void {
    if (entitySnapshot) {
      this.merge(type, entitySnapshot as { id: string });
    }
    for (const [queryKey, ids] of indexSnapshot) {
      this._queryIndices.set(queryKey, ids);
    }
  }

  /**
   * Commit an optimistic layer after server confirms the mutation.
   * Sets base to server data, removes the layer, recomputes visible.
   */
  commitLayer(
    type: string,
    id: string,
    mutationId: string,
    serverData: Record<string, unknown>,
  ): void {
    const entry = this._entities.get(type)?.get(id);
    if (!entry) return;

    const { normalized, extracted } = normalizeEntity(type, serverData);

    // Merge extracted nested entities
    for (const [nestedType, nestedItems] of extracted) {
      for (const nestedItem of nestedItems) {
        this._mergeOne(nestedType, nestedItem);
      }
    }

    entry.base = normalized;
    entry.layers.delete(mutationId);
    this._recomputeVisible(entry);
  }

  // --- Private helpers ---

  /**
   * Merge a single (already normalized) entity into the store.
   */
  private _mergeOne(type: string, item: Record<string, unknown>): void {
    const id = item.id as string;
    const typeMap = this._entities.get(type);
    const entry = typeMap?.get(id);

    if (entry) {
      const mergedBase = shallowMerge(entry.base, item);
      if (!shallowEqual(entry.base, mergedBase)) {
        entry.base = mergedBase;
        this._recomputeVisible(entry);
      }
    } else {
      const newSignal = signal(item);
      const newEntry: EntityEntry = {
        signal: newSignal,
        base: item,
        layers: new Map(),
        refCount: 0,
        orphanedAt: null,
      };
      this._getOrCreateTypeMap(type).set(id, newEntry);
      this._notifyTypeChange(type);
    }
  }

  /**
   * Recompute the visible signal value from base + all layers.
   */
  private _recomputeVisible(entry: EntityEntry): void {
    let visible = { ...entry.base };
    for (const patch of entry.layers.values()) {
      visible = shallowMerge(visible, patch);
    }

    const current = entry.signal.peek();
    if (current == null || !shallowEqual(current, visible)) {
      untrack(() => {
        entry.signal.value = visible;
      });
    }
  }

  private _getOrCreateTypeMap(type: string): Map<string, EntityEntry> {
    let typeMap = this._entities.get(type);
    if (!typeMap) {
      typeMap = new Map();
      this._entities.set(type, typeMap);
    }
    return typeMap;
  }

  private _getOrCreateListeners(type: string): Set<() => void> {
    let listeners = this._typeListeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this._typeListeners.set(type, listeners);
    }
    return listeners;
  }

  private _notifyTypeChange(type: string): void {
    const listeners = this._typeListeners.get(type);
    if (listeners) {
      for (const callback of listeners) {
        callback();
      }
    }
  }
}
