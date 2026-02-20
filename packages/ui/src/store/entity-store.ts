import { signal, computed } from '../runtime/signal';
import { batch } from '../runtime/scheduler';
import { untrack } from '../runtime/tracking';
import type { Signal, ReadonlySignal } from '../runtime/signal-types';
import { shallowMerge, shallowEqual } from './merge';
import { QueryResultIndex } from './query-result-index';
import type { SerializedStore, EntityStoreOptions } from './types';

/**
 * EntityStore - Normalized, signal-backed entity cache for @vertz/ui.
 * 
 * Stores entities by type and ID, with signal-per-entity reactivity.
 * Supports field-level merge, SSR hydration, and query result indices.
 */
export class EntityStore {
  private _entities = new Map<string, Map<string, Signal<any>>>();
  private _typeListeners = new Map<string, Set<() => void>>();
  private _queryIndices = new QueryResultIndex();

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
    
    if (typeMap?.has(id)) {
      return typeMap.get(id)! as ReadonlySignal<T | undefined>;
    }
    
    // Create undefined signal for missing entity (allows reactive queries to work)
    const sig = signal<T | undefined>(undefined);
    this._getOrCreateTypeMap(type).set(id, sig);
    return sig as ReadonlySignal<T | undefined>;
  }

  /**
   * Read multiple entities by IDs. Returns a computed signal of the array.
   * Returns a NEW computed signal each call (not cached).
   */
  getMany<T>(type: string, ids: string[]): ReadonlySignal<(T | undefined)[]> {
    return computed(() => ids.map(id => this.get<T>(type, id).value));
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
        const typeMap = this._entities.get(type);
        const existing = typeMap?.get(item.id);
        
        if (existing) {
          // Update existing entity
          const current = existing.peek(); // read without subscribing
          const merged = shallowMerge(current || {}, item);
          
          if (!shallowEqual(current || {}, merged)) {
            // Data changed - update signal (wrapped in untrack to prevent circular effects)
            untrack(() => {
              existing.value = merged;
            });
          }
          // If shallowEqual → no signal update → no re-renders
        } else {
          // New entity - create signal and notify type listeners
          const newSignal = signal<T>(item);
          this._getOrCreateTypeMap(type).set(item.id, newSignal);
          this._notifyTypeChange(type);
        }
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
    const existing = typeMap.get(id);
    if (existing) {
      existing.value = undefined;
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
    
    const signal = typeMap.get(id);
    return signal?.peek() !== undefined;
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
    for (const signal of typeMap.values()) {
      if (signal.peek() !== undefined) {
        count++;
      }
    }
    return count;
  }

  /**
   * Serialize the store for SSR transfer.
   */
  dehydrate(): SerializedStore {
    const entities: Record<string, Record<string, unknown>> = {};
    
    for (const [type, typeMap] of this._entities.entries()) {
      const typeEntities: Record<string, unknown> = {};
      
      for (const [id, signal] of typeMap.entries()) {
        const value = signal.peek();
        if (value !== undefined) {
          typeEntities[id] = value;
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
      ...(Object.keys(queries).length > 0 ? { queries } : {})
    };
  }

  /**
   * Hydrate from serialized data. Merges into existing store (doesn't replace).
   */
  hydrate(data: SerializedStore): void {
    // Hydrate entities
    for (const [type, typeEntities] of Object.entries(data.entities)) {
      const entities = Object.values(typeEntities).map(entity => ({
        ...(entity as any),
        id: (entity as any).id
      }));
      this.merge(type, entities);
    }
    
    // Hydrate query indices
    if (data.queries) {
      for (const [queryKey, queryData] of Object.entries(data.queries)) {
        this._queryIndices.set(queryKey, queryData.ids);
      }
    }
  }

  // --- Private helpers ---

  private _getOrCreateTypeMap(type: string): Map<string, Signal<any>> {
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
