/**
 * Derive a cache key from a thunk function.
 *
 * Uses the string representation of the function as a simple fingerprint.
 * For deterministic keys in production, prefer passing an explicit `key` option.
 */
export function deriveKey(thunk) {
  return `__q:${hashString(thunk.toString())}`;
}
/**
 * Simple string hash (djb2 variant).
 * Fast, deterministic, and sufficient for cache key deduplication.
 */
export function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}
//# sourceMappingURL=key-derivation.js.map
