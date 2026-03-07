import type { MutationEventBus } from './mutation-event-bus';
import { createMutationEventBus } from './mutation-event-bus';

/**
 * Module-level singleton MutationEventBus.
 * All entity-backed queries and optimistic handlers share this instance.
 */
let _bus = createMutationEventBus();

/** Get the global MutationEventBus singleton. */
export function getMutationEventBus(): MutationEventBus {
  return _bus;
}

/** Reset the MutationEventBus singleton (for SSR per-request isolation). */
export function resetMutationEventBus(): void {
  _bus = createMutationEventBus();
}

// Install global hook so ui-server can reset the bus per-request
// without importing @vertz/ui directly (avoids circular deps).
// biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
(globalThis as any).__VERTZ_CLEAR_MUTATION_EVENT_BUS__ = resetMutationEventBus;
