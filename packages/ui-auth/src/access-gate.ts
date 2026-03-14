import { computed, useContext } from '@vertz/ui';
import type { AccessSet } from '@vertz/ui/auth';
import { AccessContext } from '@vertz/ui/auth';
import { __child } from '@vertz/ui/internals';

export interface AccessGateProps {
  fallback?: () => unknown;
  children: (() => unknown) | unknown;
}

export function AccessGate({ fallback, children }: AccessGateProps): HTMLElement {
  const ctx = useContext(AccessContext);

  if (!ctx) {
    // No provider — render children (fail-open)
    return __child(() => (typeof children === 'function' ? children() : children));
  }

  const isLoaded = computed(() => {
    const set = ctx.accessSet as AccessSet | null;
    return set !== null;
  });

  return __child(() => {
    if (isLoaded.value) {
      return typeof children === 'function' ? children() : children;
    }
    return fallback ? fallback() : null;
  });
}
