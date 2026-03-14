import type { ReadonlySignal } from '@vertz/ui';
import { computed, useContext } from '@vertz/ui';
import type { Entitlement } from '@vertz/ui/auth';
import { AuthContext, can } from '@vertz/ui/auth';
import { domEffect, getSSRContext, isBrowser } from '@vertz/ui/internals';
import { RouterContext } from '@vertz/ui/router';

export interface ProtectedRouteProps {
  loginPath?: string;
  fallback?: () => unknown;
  children: (() => unknown) | unknown;
  requires?: Entitlement[];
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
}: ProtectedRouteProps): ReadonlySignal<unknown> | unknown {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    if (__DEV__) {
      console.warn('ProtectedRoute used without AuthProvider — rendering children unprotected');
    }
    return typeof children === 'function' ? children() : children;
  }

  const router = useContext(RouterContext);
  const checks = requires?.map((e) => can(e));

  const allAllowed = computed(
    () => !checks || checks.every((c) => (c.allowed as unknown as ReadonlySignal<boolean>).value),
  );

  const isResolved = computed(() => {
    const status = ctx.status;
    return status !== 'idle' && status !== 'loading';
  });

  const shouldRedirect = computed(() => {
    if (!isResolved.value) return false;
    return !(ctx.isAuthenticated as boolean);
  });

  // Side effect: redirect on unauthenticated states.
  // Use getSSRContext() to detect active SSR render — more precise than isBrowser()
  // which also returns false in non-browser test environments.
  const ssrCtx = getSSRContext();
  if (ssrCtx) {
    // SSR: write redirect to context so the server can return 302
    if (shouldRedirect.value) {
      const search = returnTo ? `?returnTo=${encodeURIComponent(ssrCtx.url)}` : '';
      ssrCtx.ssrRedirect = { to: `${loginPath}${search}` };
    }
  } else if (router) {
    // Client: domEffect tracks dependencies reactively and re-runs when shouldRedirect changes.
    domEffect(() => {
      if (shouldRedirect.value) {
        const search =
          returnTo && isBrowser()
            ? `?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`
            : '';
        router.navigate({ to: `${loginPath}${search}`, replace: true });
      }
    });
  }

  return computed(() => {
    if (!isResolved.value) {
      return fallback ? fallback() : null;
    }
    if (shouldRedirect.value) {
      return fallback ? fallback() : null;
    }
    if (!allAllowed.value) {
      return forbidden ? forbidden() : null;
    }
    return typeof children === 'function' ? children() : children;
  });
}
