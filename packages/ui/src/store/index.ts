/**
 * @module @vertz/ui/store
 * 
 * EntityStore - Normalized entity cache with signal-based reactivity.
 * Client-side companion to Entity-Driven Architecture.
 */

export { EntityStore } from './entity-store';
export { QueryResultIndex } from './query-result-index';
export { shallowMerge, shallowEqual } from './merge';
export { createTestStore } from './test-utils';
export type { SerializedStore, EntityStoreOptions } from './types';
