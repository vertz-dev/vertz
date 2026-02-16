/**
 * Derive a cache key from a thunk function.
 *
 * Uses the string representation of the function as a simple fingerprint.
 * For deterministic keys in production, prefer passing an explicit `key` option.
 */
export declare function deriveKey(thunk: () => unknown): string;
/**
 * Simple string hash (djb2 variant).
 * Fast, deterministic, and sufficient for cache key deduplication.
 */
export declare function hashString(str: string): string;
//# sourceMappingURL=key-derivation.d.ts.map
