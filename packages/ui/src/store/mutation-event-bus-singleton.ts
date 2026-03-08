import type { MutationEventBus } from './mutation-event-bus';
import { createMutationEventBus } from './mutation-event-bus';

/**
 * Module-level singleton MutationEventBus.
 *
 * Used in CSR only — all entity-backed queries and optimistic handlers
 * share this instance within a single browser tab.
 *
 * During SSR, query() skips bus subscription entirely (via !isSSR() guard),
 * so this singleton is never accessed during server-side renders.
 */
let _bus = createMutationEventBus();

/** Get the global MutationEventBus singleton. */
export function getMutationEventBus(): MutationEventBus {
  return _bus;
}

/**
 * Reset the MutationEventBus singleton.
 * @internal — test utility only, not part of the public API.
 * Ensures clean state between test cases.
 */
export function resetMutationEventBus(): void {
  _bus = createMutationEventBus();
}
