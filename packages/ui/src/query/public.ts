/**
 * @vertz/ui/query — Public subpath barrel.
 *
 * Only the curated public API is exported here.
 * Internal symbols (MemoryCache, deriveKey) live in @vertz/ui/internals
 * or the internal barrel (./index.ts).
 */

export type { CacheStore } from './cache';
export type { QueryOptions, QueryResult } from './query';
export { query } from './query';
