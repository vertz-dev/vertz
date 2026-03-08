import { getSSRContext } from '../ssr/ssr-render-context';
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
  const ctx = getSSRContext();
  if (ctx) return ctx.entityStore;
  return _store;
}

/** Get the global QueryEnvelopeStore singleton. */
export function getQueryEnvelopeStore(): QueryEnvelopeStore {
  const ctx = getSSRContext();
  if (ctx) return ctx.envelopeStore;
  return _envelopeStore;
}

/**
 * Reset the module-level EntityStore and QueryEnvelopeStore singletons.
 * Used by tests to ensure clean state between test cases.
 * In SSR, per-request isolation provides fresh instances automatically.
 * @internal — test utility only, not part of the public API.
 */
export function resetEntityStore(): void {
  _store = new EntityStore();
  _envelopeStore = new QueryEnvelopeStore();
}
