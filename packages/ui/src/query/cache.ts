/**
 * Interface for cache stores used by query().
 * Consumers can provide custom implementations (e.g. LRU, persistent storage).
 */
export interface CacheStore<T = unknown> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear?(): void;
}

/**
 * Default in-memory cache backed by a Map.
 */
export class MemoryCache<T = unknown> implements CacheStore<T> {
  private _store = new Map<string, T>();

  get(key: string): T | undefined {
    return this._store.get(key);
  }

  set(key: string, value: T): void {
    this._store.set(key, value);
  }

  delete(key: string): void {
    this._store.delete(key);
  }

  clear(): void {
    this._store.clear();
  }
}
