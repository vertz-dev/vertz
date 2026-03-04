/**
 * @module @vertz/ui/store
 *
 * EntityStore - Normalized entity cache with signal-based reactivity.
 * Client-side companion to Entity-Driven Architecture.
 */

export { EntityStore } from './entity-store';
export { shallowEqual, shallowMerge } from './merge';
export { QueryResultIndex } from './query-result-index';
export { createTestStore } from './test-utils';
export type { EntityStoreOptions, SerializedStore } from './types';
