import { useContext } from '@vertz/ui';
import type { AccessSet } from '@vertz/ui/auth';
import { AccessContext } from '@vertz/ui/auth';
import type { JSX } from '@vertz/ui/jsx-runtime';

export interface AccessGateProps {
  fallback?: () => unknown;
  children: (() => unknown) | unknown;
}

export function AccessGate({ fallback, children }: AccessGateProps): JSX.Element {
  const ctx = useContext(AccessContext);

  if (!ctx) {
    return (
      <span style={{ display: 'contents' }}>
        {typeof children === 'function' ? children() : children}
      </span>
    );
  }

  const isLoaded = (ctx.accessSet as AccessSet | null) !== null;

  return (
    <span style={{ display: 'contents' }}>
      {isLoaded
        ? typeof children === 'function'
          ? children()
          : children
        : fallback
          ? fallback()
          : null}
    </span>
  );
}
