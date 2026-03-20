import { useContext } from '@vertz/ui';
import { AuthContext } from '@vertz/ui/auth';
import { domEffect, getSSRContext, isBrowser } from '@vertz/ui/internals';
import type { JSX } from '@vertz/ui/jsx-runtime';
import { RouterContext } from '@vertz/ui/router';
import { createEntitlementGuard } from './entitlement-check';

export interface ProtectedRouteProps {
  loginPath?: string;
  fallback?: () => unknown;
  children: (() => unknown) | unknown;
  requires?: string[];
  forbidden?: () => unknown;
  returnTo?: boolean;
}

declare const process: { env: Record<string, string | undefined> } | undefined;
const __DEV__ = typeof process !== 'undefined' && process?.env.NODE_ENV !== 'production';

export function ProtectedRoute({
  loginPath = '/login',
  fallback,
  children,
  requires,
  forbidden,
  returnTo = true,
}: ProtectedRouteProps): JSX.Element {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    if (__DEV__) {
      console.warn('ProtectedRoute used without AuthProvider — rendering children unprotected');
    }
    return (
      <span style={{ display: 'contents' }}>{typeof children === 'function' ? children() : children}</span>
    );
  }

  const router = useContext(RouterContext);

  // Create entitlement guard eagerly (context scope is active here).
  // Returns a function that reads .allowed.value reactively.
  const isAllowed = createEntitlementGuard(requires);

  const isResolved = ctx.status !== 'idle' && ctx.status !== 'loading';
  const shouldRedirect = isResolved && !ctx.isAuthenticated;

  // Side effect: redirect on unauthenticated states.
  const ssrCtx = getSSRContext();
  if (ssrCtx) {
    if (shouldRedirect) {
      const search = returnTo ? `?returnTo=${encodeURIComponent(ssrCtx.url)}` : '';
      ssrCtx.ssrRedirect = { to: `${loginPath}${search}` };
    }
  } else if (router) {
    domEffect(() => {
      if (shouldRedirect) {
        const search =
          returnTo && isBrowser()
            ? `?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`
            : '';
        router.navigate({ to: `${loginPath}${search}`, replace: true });
      }
    });
  }

  return (
    <span style={{ display: 'contents' }}>
      {!isResolved
        ? fallback
          ? fallback()
          : null
        : shouldRedirect
          ? fallback
            ? fallback()
            : null
          : !isAllowed()
            ? forbidden
              ? forbidden()
              : null
            : typeof children === 'function'
              ? children()
              : children}
    </span>
  );
}
