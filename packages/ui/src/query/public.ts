/**
 * @vertz/ui/query — Public subpath barrel.
 *
 * Only the curated public API is exported here.
 * Internal symbols (MemoryCache, deriveKey) live in @vertz/ui/internals
 * or the internal barrel (./index.ts).
 */

export type { QueryDescriptor } from '@vertz/fetch';
export { isQueryDescriptor } from '@vertz/fetch';
export type { CacheStore } from './cache';
export type { QueryOptions, QueryResult } from './query';
export { query } from './query';
export type { QueryMatchHandlers } from './query-match';
export { queryMatch } from './query-match';
