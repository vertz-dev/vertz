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
 * Default in-memory cache backed by a Map with optional LRU eviction.
 *
 * When `maxSize` is finite, least-recently-used entries are evicted on `set()`
 * when the cache exceeds the limit. `get()` promotes entries to most-recently-used.
 */
export class MemoryCache<T = unknown> implements CacheStore<T> {
  private _store = new Map<string, T>();
  private _maxSize: number;

  constructor(options?: { maxSize?: number }) {
    this._maxSize = options?.maxSize ?? 1000;
  }

  get(key: string): T | undefined {
    if (!this._store.has(key)) return undefined;
    const value = this._store.get(key) as T;
    // Promote to most-recently-used by re-inserting at end of Map
    this._store.delete(key);
    this._store.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    // Remove first so re-insert goes to end (most-recently-used position)
    if (this._store.has(key)) this._store.delete(key);
    this._store.set(key, value);
    // Evict oldest entries if over capacity
    while (this._store.size > this._maxSize) {
      const oldest = this._store.keys().next().value;
      if (oldest !== undefined) this._store.delete(oldest);
    }
  }

  delete(key: string): void {
    this._store.delete(key);
  }

  clear(): void {
    this._store.clear();
  }
}
