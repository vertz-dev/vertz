/**
 * @module @vertz/ui/store
 *
 * EntityStore - Normalized entity cache with signal-based reactivity.
 * Client-side companion to Entity-Driven Architecture.
 */

export { EntityStore } from './entity-store';
export { getEntityStore, getQueryEnvelopeStore } from './entity-store-singleton';
export { shallowEqual, shallowMerge } from './merge';
export { createOptimisticHandler } from './optimistic-handler';
export type { QueryEnvelope } from './query-envelope-store';
export { QueryEnvelopeStore } from './query-envelope-store';
export { QueryResultIndex } from './query-result-index';
export { createTestStore } from './test-utils';
export type { EntityStoreOptions, SerializedStore } from './types';
