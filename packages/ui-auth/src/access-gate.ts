import type { ReadonlySignal } from '@vertz/ui';
import { computed, useContext } from '@vertz/ui';
import type { AccessSet } from '@vertz/ui/auth';
import { AccessContext } from '@vertz/ui/auth';

export interface AccessGateProps {
  fallback?: () => unknown;
  children: (() => unknown) | unknown;
}

export function AccessGate({
  fallback,
  children,
}: AccessGateProps): ReadonlySignal<unknown> | unknown {
  const ctx = useContext(AccessContext);

  if (!ctx) {
    return typeof children === 'function' ? children() : children;
  }

  const isLoaded = computed(() => {
    const set = ctx.accessSet as AccessSet | null;
    return set !== null;
  });

  return computed(() => {
    if (isLoaded.value) {
      return typeof children === 'function' ? children() : children;
    }
    return fallback ? fallback() : null;
  });
}
