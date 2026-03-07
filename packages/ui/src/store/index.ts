/**
 * @module @vertz/ui/store
 *
 * EntityStore - Normalized entity cache with signal-based reactivity.
 * Client-side companion to Entity-Driven Architecture.
 */

export { EntityStore } from './entity-store';
export { getEntityStore, getQueryEnvelopeStore, resetEntityStore } from './entity-store-singleton';
export { shallowEqual, shallowMerge } from './merge';
export type { MutationEventBus } from './mutation-event-bus';
export { createMutationEventBus } from './mutation-event-bus';
export { getMutationEventBus, resetMutationEventBus } from './mutation-event-bus-singleton';
export { createOptimisticHandler } from './optimistic-handler';
export type { QueryEnvelope } from './query-envelope-store';
export { QueryEnvelopeStore } from './query-envelope-store';
export { QueryResultIndex } from './query-result-index';
export { createTestStore } from './test-utils';
export type { EntityStoreOptions, SerializedStore } from './types';
