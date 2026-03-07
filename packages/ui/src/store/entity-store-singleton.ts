import { EntityStore } from './entity-store';
import { QueryEnvelopeStore } from './query-envelope-store';

/**
 * Module-level singleton EntityStore.
 * All entity-backed queries and optimistic handlers share this instance.
 */
let _store = new EntityStore();
let _envelopeStore = new QueryEnvelopeStore();

/** Get the global EntityStore singleton. */
export function getEntityStore(): EntityStore {
  return _store;
}

/** Get the global QueryEnvelopeStore singleton. */
export function getQueryEnvelopeStore(): QueryEnvelopeStore {
  return _envelopeStore;
}

/** Reset the EntityStore singleton (for SSR per-request isolation). */
export function resetEntityStore(): void {
  _store = new EntityStore();
  _envelopeStore = new QueryEnvelopeStore();
}

// Install global hook so ui-server can reset the entity store per-request
// without importing @vertz/ui directly (avoids circular deps).
// biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
(globalThis as any).__VERTZ_CLEAR_ENTITY_STORE__ = resetEntityStore;
