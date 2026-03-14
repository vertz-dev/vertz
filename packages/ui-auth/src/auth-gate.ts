import { computed, useContext } from '@vertz/ui';
import { AuthContext } from '@vertz/ui/auth';
import { __child } from '@vertz/ui/internals';

export interface AuthGateProps {
  fallback?: () => unknown;
  children: (() => unknown) | unknown;
}

export function AuthGate({ fallback, children }: AuthGateProps): HTMLElement {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    // No provider — render children (fail-open)
    return __child(() => (typeof children === 'function' ? children() : children));
  }

  const isResolved = computed(() => {
    const status = ctx.status;
    return status !== 'idle' && status !== 'loading';
  });

  return __child(() => {
    if (isResolved.value) {
      return typeof children === 'function' ? children() : children;
    }
    return fallback ? fallback() : null;
  });
}
