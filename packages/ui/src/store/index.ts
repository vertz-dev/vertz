/**
 * @module @vertz/ui/store
 *
 * EntityStore - Normalized entity cache with signal-based reactivity.
 * Client-side companion to Entity-Driven Architecture.
 */

export { EntityStore } from './entity-store';
export { getEntityStore, getQueryEnvelopeStore } from './entity-store-singleton';
export { shallowEqual, shallowMerge } from './merge';
export type { MutationEventBus } from './mutation-event-bus';
export { createMutationEventBus } from './mutation-event-bus';
export { getMutationEventBus } from './mutation-event-bus-singleton';
export type { OptimisticHandlerOptions } from './optimistic-handler';
export { createOptimisticHandler } from './optimistic-handler';
export type { QueryEnvelope } from './query-envelope-store';
export { QueryEnvelopeStore } from './query-envelope-store';
export { QueryResultIndex } from './query-result-index';
export type { RelationFieldDef, RelationSchema } from './relation-registry';
export {
  getRelationSchema,
  registerRelationSchema,
  resetRelationSchemas_TEST_ONLY,
} from './relation-registry';
export { createTestStore } from './test-utils';
export type { EntityStoreOptions, SerializedStore } from './types';
