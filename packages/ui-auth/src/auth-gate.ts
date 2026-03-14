import type { ReadonlySignal } from '@vertz/ui';
import { computed, useContext } from '@vertz/ui';
import { AuthContext } from '@vertz/ui/auth';

export interface AuthGateProps {
  fallback?: () => unknown;
  children: (() => unknown) | unknown;
}

export function AuthGate({ fallback, children }: AuthGateProps): ReadonlySignal<unknown> | unknown {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    return typeof children === 'function' ? children() : children;
  }

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
