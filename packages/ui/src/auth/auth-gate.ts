/**
 * AuthGate — gates rendering on auth state resolution.
 *
 * Renders fallback (or nothing) while auth is loading (idle/loading).
 * Renders children once the auth state resolves to any definitive state
 * (authenticated, unauthenticated, mfa_required, error).
 */

import { useContext } from '../component/context';
import { computed } from '../runtime/signal';
import type { ReadonlySignal } from '../runtime/signal-types';
import { AuthContext } from './auth-context';

export interface AuthGateProps {
  fallback?: () => unknown;
  children: (() => unknown) | unknown;
}

export function AuthGate({ fallback, children }: AuthGateProps): ReadonlySignal<unknown> | unknown {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    // No provider — render children (fail-open)
    return typeof children === 'function' ? children() : children;
  }

  // ctx.status is auto-unwrapped by wrapSignalProps — reads signal.value via getter
  const isResolved = computed(() => {
    const status = ctx.status;
    return status !== 'idle' && status !== 'loading';
  });

  return computed(() => {
    if (isResolved.value) {
      return typeof children === 'function' ? children() : children;
    }
    return fallback ? fallback() : null;
  });
}
