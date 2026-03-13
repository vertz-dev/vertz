/**
 * ProtectedRoute — auth-gated route component.
 *
 * Renders fallback while auth is resolving (idle/loading).
 * Renders children when authenticated (and entitlements met).
 * Renders forbidden when authenticated but lacking required entitlements.
 * Navigates to loginPath when unauthenticated/error/mfa_required.
 */

import { useContext } from '../component/context';
import { RouterContext } from '../router/router-context';
import { computed } from '../runtime/signal';
import type { ReadonlySignal } from '../runtime/signal-types';
import { can } from './access-context';
import { AuthContext } from './auth-context';

export interface ProtectedRouteProps {
  /** Path to redirect to when unauthenticated. Default: '/login' */
  loginPath?: string;
  /** Rendered while auth is resolving (idle/loading). Default: null */
  fallback?: () => unknown;
  /** Rendered when authenticated */
  children: (() => unknown) | unknown;
  /** Optional: required entitlements (integrates with can()) */
  requires?: string[];
  /** Rendered when authenticated but lacking required entitlements. Default: null */
  forbidden?: () => unknown;
  /** Append ?returnTo=<currentPath> when redirecting. Default: true */
  returnTo?: boolean;
}

const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

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

  // Lazy router access — only needed for redirect path, doesn't throw without provider
  const router = useContext(RouterContext);

  // Call can() eagerly in component body — context stack requirement.
  // can() uses useContext(AccessContext) internally, which needs Provider on the call stack.
  const checks = requires?.map((e) => can(e));

  // can() returns signal-backed properties typed as plain values (signal-api pattern).
  // In framework code (no compiler transforms), cast to ReadonlySignal to read .value for tracking.
  const allAllowed = computed(
    () => !checks || checks.every((c) => (c.allowed as unknown as ReadonlySignal<boolean>).value),
  );

  const isResolved = computed(() => {
    const status = ctx.status;
    return status !== 'idle' && status !== 'loading';
  });

  // Track whether we've already fired a redirect to avoid duplicate navigate calls
  let redirectFired = false;

  return computed(() => {
    if (!isResolved.value) {
      return fallback ? fallback() : null;
    }

    if (!(ctx.isAuthenticated as boolean)) {
      // Fire redirect as a fire-and-forget side effect.
      // Safe in computed because: (1) navigate is idempotent for same URL,
      // (2) SSR router's navigate is a no-op, (3) guarded by redirectFired flag.
      if (router && !redirectFired) {
        redirectFired = true;
        const search =
          returnTo && typeof window !== 'undefined'
            ? `?returnTo=${encodeURIComponent(window.location.pathname)}`
            : '';
        router.navigate({ to: `${loginPath}${search}`, replace: true });
      }
      return fallback ? fallback() : null;
    }

    redirectFired = false;
    if (!allAllowed.value) {
      return forbidden ? forbidden() : null;
    }
    return typeof children === 'function' ? children() : children;
  });
}
