/**
 * AccessGate — gates rendering on access set loading state.
 *
 * Renders fallback (or nothing) while the access set is loading.
 * Renders children once loaded.
 */

import { useContext } from '../component/context';
import { computed } from '../runtime/signal';
import type { ReadonlySignal } from '../runtime/signal-types';
import { AccessContext } from './access-context';
import type { AccessSet } from './access-set-types';

export interface AccessGateProps {
  fallback?: () => unknown;
  children: (() => unknown) | unknown;
}

/**
 * Gate component that blocks children while the access set is loading.
 * Use this to prevent flicker on initial render when access data
 * hasn't been hydrated yet.
 */
export function AccessGate({
  fallback,
  children,
}: AccessGateProps): ReadonlySignal<unknown> | unknown {
  // Use useContext directly (not useAccessContext which throws).
  // AccessGate needs graceful fallback when no provider is present.
  const ctx = useContext(AccessContext);

  if (!ctx) {
    // No provider — render children (fail-open for UI, server enforces)
    return typeof children === 'function' ? children() : children;
  }

  const isLoaded = computed(() => {
    const set = ctx.accessSet as AccessSet | null;
    return set !== null;
  });

  // Return the computed signal itself — the framework subscribes to it
  // for reactive re-evaluation when isLoaded changes.
  return computed(() => {
    if (isLoaded.value) {
      return typeof children === 'function' ? children() : children;
    }
    return fallback ? fallback() : null;
  });
}
