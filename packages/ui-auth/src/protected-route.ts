import type { ReadonlySignal } from '@vertz/ui';
import { computed, useContext } from '@vertz/ui';
import type { Entitlement } from '@vertz/ui/auth';
import { AuthContext, can } from '@vertz/ui/auth';
import { domEffect, isBrowser } from '@vertz/ui/internals';
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

  if (router) {
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
