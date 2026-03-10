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
  private _refs = new Map<string, number>();
  // Insertion order = orphan order (longest-orphaned first)
  private _orphans = new Map<string, true>();

  constructor(options?: { maxSize?: number }) {
    const raw = options?.maxSize ?? 1000;
    this._maxSize = Number.isNaN(raw) ? 1000 : Math.max(0, raw);
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
    // Evict entries if over capacity.
    // Priority: 1) orphaned (explicitly released), 2) unclaimed (never retained), 3) retained
    while (this._store.size > this._maxSize) {
      // 1. Orphaned entries (longest-orphaned first)
      const orphan = this._orphans.keys().next();
      if (!orphan.done && this._store.has(orphan.value)) {
        this._store.delete(orphan.value);
        this._orphans.delete(orphan.value);
        this._refs.delete(orphan.value);
        continue;
      }
      // 2. Unclaimed entries (oldest in _store with no ref count, excluding current key)
      let evicted = false;
      for (const k of this._store.keys()) {
        if (k !== key && !this._refs.has(k)) {
          this._store.delete(k);
          evicted = true;
          break;
        }
      }
      if (evicted) continue;
      // 3. Retained entries (last resort — oldest retained)
      const oldest = this._store.keys().next();
      if (oldest.done) break;
      this._store.delete(oldest.value);
      this._refs.delete(oldest.value);
      this._orphans.delete(oldest.value);
    }
  }

  delete(key: string): void {
    this._store.delete(key);
    this._refs.delete(key);
    this._orphans.delete(key);
  }

  clear(): void {
    this._store.clear();
    this._refs.clear();
    this._orphans.clear();
  }

  /** Mark a cache key as actively used by a query instance. */
  retain(key: string): void {
    const count = (this._refs.get(key) ?? 0) + 1;
    this._refs.set(key, count);
    this._orphans.delete(key);
  }

  /** Release a cache key when a query instance disposes or changes key. */
  release(key: string): void {
    const count = (this._refs.get(key) ?? 0) - 1;
    if (count <= 0) {
      this._refs.delete(key);
      if (this._store.has(key)) {
        this._orphans.set(key, true);
      }
    } else {
      this._refs.set(key, count);
    }
  }
}
