import { describe, expect, it, mock } from 'bun:test';
import { computed, signal } from '@vertz/ui';
import type { AccessSet, AuthClientError, AuthContextValue, AuthStatus } from '@vertz/ui/auth';
import { AccessContext, AuthContext } from '@vertz/ui/auth';
import type { Router } from '@vertz/ui/router';
import { RouterContext } from '@vertz/ui/router';
import { ProtectedRoute } from '../protected-route';
import { itWithNativeCompiler } from './native-compiler-test-utils.test';

function mockAuthContext(status: AuthStatus) {
  const statusSignal = signal<AuthStatus>(status);
  const userSignal = signal(null);
  const errorSignal = signal<AuthClientError | null>(null);

  const noop = Object.assign(() => Promise.resolve({ ok: true as const, data: undefined }), {
    url: '/api/auth/noop',
    method: 'POST',
    meta: { bodySchema: { parse: (d: unknown) => ({ ok: true as const, data: d }) } },
  });

  const ctx: AuthContextValue = {
    user: userSignal,
    status: statusSignal,
    isAuthenticated: computed(() => statusSignal.value === 'authenticated'),
    isLoading: computed(() => statusSignal.value === 'loading'),
    error: errorSignal,
    signIn: noop as AuthContextValue['signIn'],
    signUp: noop as AuthContextValue['signUp'],
    signOut: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    mfaChallenge: noop as AuthContextValue['mfaChallenge'],
    forgotPassword: noop as AuthContextValue['forgotPassword'],
    resetPassword: noop as AuthContextValue['resetPassword'],
    providers: signal([]),
  };

  return { ctx, statusSignal };
}

function mockRouter() {
  const navigateFn = mock(() => Promise.resolve());
  const router = {
    current: signal(null),
    loaderData: signal([]),
    loaderError: signal(null),
    searchParams: signal({}),
    navigate: navigateFn,
    revalidate: () => Promise.resolve(),
    dispose: () => {},
  } as unknown as Router;

  return { router, navigateFn };
}

function mockAccessSet(entitlements: AccessSet['entitlements']): AccessSet {
  return {
    entitlements,
    flags: {},
    plan: null,
    computedAt: new Date().toISOString(),
  };
}

describe('ProtectedRoute', () => {
  it('renders fallback when status is idle', () => {
    const { ctx } = mockAuthContext('idle');
    let wrapper: HTMLElement | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        wrapper = ProtectedRoute({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        });
      },
    });

    expect(wrapper?.textContent).toBe('loading-fallback');
  });

  it('renders children when status is authenticated', () => {
    const { ctx } = mockAuthContext('authenticated');
    let wrapper: HTMLElement | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        wrapper = ProtectedRoute({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        });
      },
    });

    expect(wrapper?.textContent).toBe('main-content');
  });

  it('renders children without provider (fail-open)', () => {
    const wrapper = ProtectedRoute({
      fallback: () => 'loading-fallback',
      children: () => 'main-content',
    });

    expect(wrapper.textContent).toBe('main-content');
  });

  it('navigates to loginPath when unauthenticated', () => {
    const { ctx } = mockAuthContext('unauthenticated');
    const { router, navigateFn } = mockRouter();

    RouterContext.Provider({
      value: router,
      children: () =>
        AuthContext.Provider({
          value: ctx,
          children: () => {
            ProtectedRoute({
              loginPath: '/sign-in',
              children: () => 'main-content',
              returnTo: false,
            });
          },
        }),
    });

    expect(navigateFn).toHaveBeenCalledWith({ to: '/sign-in', replace: true });
  });

  it('does not navigate when authenticated', () => {
    const { ctx } = mockAuthContext('authenticated');
    const { router, navigateFn } = mockRouter();

    RouterContext.Provider({
      value: router,
      children: () =>
        AuthContext.Provider({
          value: ctx,
          children: () => {
            ProtectedRoute({
              children: () => 'main-content',
            });
          },
        }),
    });

    expect(navigateFn).not.toHaveBeenCalled();
  });

  itWithNativeCompiler(
    'transitions from fallback to children when status changes to authenticated',
    () => {
      const { ctx, statusSignal } = mockAuthContext('loading');
      let wrapper: HTMLElement | undefined;

      AuthContext.Provider({
        value: ctx,
        children: () => {
          wrapper = ProtectedRoute({
            fallback: () => 'loading-fallback',
            children: () => 'main-content',
          });
        },
      });

      expect(wrapper?.textContent).toBe('loading-fallback');

      statusSignal.value = 'authenticated';
      expect(wrapper?.textContent).toBe('main-content');
    },
  );

  it('renders children when requires entitlements are met', () => {
    const { ctx } = mockAuthContext('authenticated');
    const accessSet = mockAccessSet({
      'task:read': { allowed: true, reasons: [] },
    });
    let wrapper: HTMLElement | undefined;

    AccessContext.Provider({
      value: { accessSet: signal(accessSet), loading: signal(false) },
      children: () =>
        AuthContext.Provider({
          value: ctx,
          children: () => {
            wrapper = ProtectedRoute({
              requires: ['task:read'],
              children: () => 'main-content',
            });
          },
        }),
    });

    expect(wrapper?.textContent).toBe('main-content');
  });

  it('renders forbidden when authenticated but missing required entitlement', () => {
    const { ctx } = mockAuthContext('authenticated');
    const accessSet = mockAccessSet({
      'task:read': {
        allowed: false,
        reasons: ['role_required'],
        reason: 'role_required',
      },
    });
    let wrapper: HTMLElement | undefined;

    AccessContext.Provider({
      value: { accessSet: signal(accessSet), loading: signal(false) },
      children: () =>
        AuthContext.Provider({
          value: ctx,
          children: () => {
            wrapper = ProtectedRoute({
              requires: ['task:read'],
              forbidden: () => 'access-denied',
              children: () => 'main-content',
            });
          },
        }),
    });

    expect(wrapper?.textContent).toBe('access-denied');
  });
});
