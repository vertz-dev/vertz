/**
 * Default in-memory cache backed by a Map.
 */
export class MemoryCache {
  _store = new Map();
  get(key) {
    return this._store.get(key);
  }
  set(key, value) {
    this._store.set(key, value);
  }
  delete(key) {
    this._store.delete(key);
  }
}
//# sourceMappingURL=cache.js.map
