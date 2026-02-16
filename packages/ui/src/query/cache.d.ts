/**
 * Interface for cache stores used by query().
 * Consumers can provide custom implementations (e.g. LRU, persistent storage).
 */
export interface CacheStore<T = unknown> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
}
/**
 * Default in-memory cache backed by a Map.
 */
export declare class MemoryCache<T = unknown> implements CacheStore<T> {
  private _store;
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
}
//# sourceMappingURL=cache.d.ts.map
