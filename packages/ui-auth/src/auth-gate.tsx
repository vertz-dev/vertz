import { useContext } from '@vertz/ui';
import { AuthContext } from '@vertz/ui/auth';
import type { JSX } from '@vertz/ui/jsx-runtime';

export interface AuthGateProps {
  fallback?: () => unknown;
  children: (() => unknown) | unknown;
}

export function AuthGate({ fallback, children }: AuthGateProps): JSX.Element {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    return (
      <span style="display:contents">{typeof children === 'function' ? children() : children}</span>
    );
  }

  const isResolved = ctx.status !== 'idle' && ctx.status !== 'loading';

  return (
    <span style="display:contents">
      {isResolved
        ? typeof children === 'function'
          ? children()
          : children
        : fallback
          ? fallback()
          : null}
    </span>
  );
}
