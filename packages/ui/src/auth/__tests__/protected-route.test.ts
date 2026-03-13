import { describe, expect, it, mock } from 'bun:test';
import type { Router } from '../../router/navigate';
import { RouterContext } from '../../router/router-context';
import { computed, signal } from '../../runtime/signal';
import type { ReadonlySignal } from '../../runtime/signal-types';
import { AccessContext } from '../access-context';
import type { AccessSet } from '../access-set-types';
import type { AuthContextValue } from '../auth-context';
import { AuthContext } from '../auth-context';
import type { AuthClientError, AuthStatus } from '../auth-types';
import { ProtectedRoute } from '../protected-route';

/** Create a minimal mock AuthContextValue with controllable status. */
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
    signIn: Object.assign(
      () =>
        Promise.resolve({
          ok: true as const,
          data: { user: { id: '1', email: '', role: '' }, expiresAt: 0 },
        }),
      {
        url: '/api/auth/signin',
        method: 'POST',
        meta: { bodySchema: { parse: (d: unknown) => ({ ok: true as const, data: d }) } },
      },
    ),
    signUp: Object.assign(
      () =>
        Promise.resolve({
          ok: true as const,
          data: { user: { id: '1', email: '', role: '' }, expiresAt: 0 },
        }),
      {
        url: '/api/auth/signup',
        method: 'POST',
        meta: { bodySchema: { parse: (d: unknown) => ({ ok: true as const, data: d }) } },
      },
    ),
    signOut: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    mfaChallenge: noop,
    forgotPassword: noop,
    resetPassword: noop,
  } as unknown as AuthContextValue;

  return { ctx, statusSignal };
}

/** Create a mock router with a spied navigate. */
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

/** Create a complete AccessSet mock with required fields. */
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
    let rendered: unknown;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        const result = ProtectedRoute({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        });
        rendered = (result as ReadonlySignal<unknown>).value;
      },
    });

    expect(rendered).toBe('loading-fallback');
  });

  it('renders fallback when status is loading', () => {
    const { ctx } = mockAuthContext('loading');
    let rendered: unknown;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        const result = ProtectedRoute({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        });
        rendered = (result as ReadonlySignal<unknown>).value;
      },
    });

    expect(rendered).toBe('loading-fallback');
  });

  it('renders children when status is authenticated', () => {
    const { ctx } = mockAuthContext('authenticated');
    let rendered: unknown;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        const result = ProtectedRoute({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        });
        rendered = (result as ReadonlySignal<unknown>).value;
      },
    });

    expect(rendered).toBe('main-content');
  });

  it('renders null when no fallback provided and auth is loading', () => {
    const { ctx } = mockAuthContext('loading');
    let rendered: unknown;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        const result = ProtectedRoute({
          children: () => 'main-content',
        });
        rendered = (result as ReadonlySignal<unknown>).value;
      },
    });

    expect(rendered).toBeNull();
  });

  it('renders children without provider (fail-open)', () => {
    const result = ProtectedRoute({
      fallback: () => 'loading-fallback',
      children: () => 'main-content',
    });

    expect(result).toBe('main-content');
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
            const result = ProtectedRoute({
              loginPath: '/sign-in',
              children: () => 'main-content',
              returnTo: false,
            });
            (result as ReadonlySignal<unknown>).value;
          },
        }),
    });

    expect(navigateFn).toHaveBeenCalledWith({ to: '/sign-in', replace: true });
  });

  it('navigates to loginPath when status is error', () => {
    const { ctx } = mockAuthContext('error');
    const { router, navigateFn } = mockRouter();

    RouterContext.Provider({
      value: router,
      children: () =>
        AuthContext.Provider({
          value: ctx,
          children: () => {
            const result = ProtectedRoute({
              loginPath: '/login',
              children: () => 'main-content',
              returnTo: false,
            });
            (result as ReadonlySignal<unknown>).value;
          },
        }),
    });

    expect(navigateFn).toHaveBeenCalledWith({ to: '/login', replace: true });
  });

  it('navigates to loginPath when status is mfa_required', () => {
    const { ctx } = mockAuthContext('mfa_required');
    const { router, navigateFn } = mockRouter();

    RouterContext.Provider({
      value: router,
      children: () =>
        AuthContext.Provider({
          value: ctx,
          children: () => {
            const result = ProtectedRoute({
              loginPath: '/login',
              children: () => 'main-content',
              returnTo: false,
            });
            (result as ReadonlySignal<unknown>).value;
          },
        }),
    });

    expect(navigateFn).toHaveBeenCalledWith({ to: '/login', replace: true });
  });

  it('navigates to /login by default when no loginPath specified', () => {
    const { ctx } = mockAuthContext('unauthenticated');
    const { router, navigateFn } = mockRouter();

    RouterContext.Provider({
      value: router,
      children: () =>
        AuthContext.Provider({
          value: ctx,
          children: () => {
            const result = ProtectedRoute({
              children: () => 'main-content',
              returnTo: false,
            });
            (result as ReadonlySignal<unknown>).value;
          },
        }),
    });

    expect(navigateFn).toHaveBeenCalledWith({ to: '/login', replace: true });
  });

  it('renders fallback while redirect fires (unauthenticated)', () => {
    const { ctx } = mockAuthContext('unauthenticated');
    const { router } = mockRouter();
    let rendered: unknown;

    RouterContext.Provider({
      value: router,
      children: () =>
        AuthContext.Provider({
          value: ctx,
          children: () => {
            const result = ProtectedRoute({
              fallback: () => 'loading-fallback',
              children: () => 'main-content',
              returnTo: false,
            });
            rendered = (result as ReadonlySignal<unknown>).value;
          },
        }),
    });

    expect(rendered).toBe('loading-fallback');
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
            const result = ProtectedRoute({
              children: () => 'main-content',
            });
            (result as ReadonlySignal<unknown>).value;
          },
        }),
    });

    expect(navigateFn).not.toHaveBeenCalled();
  });

  it('transitions from fallback to children when status changes to authenticated', () => {
    const { ctx, statusSignal } = mockAuthContext('loading');
    const rendered = { current: null as ReadonlySignal<unknown> | null };

    AuthContext.Provider({
      value: ctx,
      children: () => {
        rendered.current = ProtectedRoute({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        }) as ReadonlySignal<unknown>;
      },
    });

    expect(rendered.current?.value).toBe('loading-fallback');

    statusSignal.value = 'authenticated';
    expect(rendered.current?.value).toBe('main-content');
  });

  it('fires navigate when status transitions from loading to unauthenticated', () => {
    const { ctx, statusSignal } = mockAuthContext('loading');
    const { router, navigateFn } = mockRouter();
    const result = { current: null as ReadonlySignal<unknown> | null };

    RouterContext.Provider({
      value: router,
      children: () =>
        AuthContext.Provider({
          value: ctx,
          children: () => {
            result.current = ProtectedRoute({
              children: () => 'main-content',
              returnTo: false,
            }) as ReadonlySignal<unknown>;
            result.current.value; // trigger initial evaluation
          },
        }),
    });

    expect(navigateFn).not.toHaveBeenCalled();

    statusSignal.value = 'unauthenticated';
    result.current?.value; // trigger re-evaluation after status change
    expect(navigateFn).toHaveBeenCalledWith({ to: '/login', replace: true });
  });

  it('renders children when requires entitlements are met', () => {
    const { ctx } = mockAuthContext('authenticated');
    const accessSet = mockAccessSet({
      'task:read': { allowed: true, reasons: [] },
    });
    let rendered: unknown;

    AccessContext.Provider({
      value: { accessSet: signal(accessSet), loading: signal(false) },
      children: () =>
        AuthContext.Provider({
          value: ctx,
          children: () => {
            const result = ProtectedRoute({
              requires: ['task:read'],
              children: () => 'main-content',
            });
            rendered = (result as ReadonlySignal<unknown>).value;
          },
        }),
    });

    expect(rendered).toBe('main-content');
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
    let rendered: unknown;

    AccessContext.Provider({
      value: { accessSet: signal(accessSet), loading: signal(false) },
      children: () =>
        AuthContext.Provider({
          value: ctx,
          children: () => {
            const result = ProtectedRoute({
              requires: ['task:read'],
              forbidden: () => 'access-denied',
              children: () => 'main-content',
            });
            rendered = (result as ReadonlySignal<unknown>).value;
          },
        }),
    });

    expect(rendered).toBe('access-denied');
  });

  it('renders null when missing required entitlement and no forbidden prop', () => {
    const { ctx } = mockAuthContext('authenticated');
    const accessSet = mockAccessSet({
      'task:read': {
        allowed: false,
        reasons: ['role_required'],
        reason: 'role_required',
      },
    });
    let rendered: unknown;

    AccessContext.Provider({
      value: { accessSet: signal(accessSet), loading: signal(false) },
      children: () =>
        AuthContext.Provider({
          value: ctx,
          children: () => {
            const result = ProtectedRoute({
              requires: ['task:read'],
              children: () => 'main-content',
            });
            rendered = (result as ReadonlySignal<unknown>).value;
          },
        }),
    });

    expect(rendered).toBeNull();
  });

  it('does not redirect when authenticated but missing entitlement', () => {
    const { ctx } = mockAuthContext('authenticated');
    const { router, navigateFn } = mockRouter();
    const accessSet = mockAccessSet({
      'task:read': {
        allowed: false,
        reasons: ['role_required'],
        reason: 'role_required',
      },
    });

    RouterContext.Provider({
      value: router,
      children: () =>
        AccessContext.Provider({
          value: { accessSet: signal(accessSet), loading: signal(false) },
          children: () =>
            AuthContext.Provider({
              value: ctx,
              children: () => {
                const result = ProtectedRoute({
                  requires: ['task:read'],
                  forbidden: () => 'access-denied',
                  children: () => 'main-content',
                });
                (result as ReadonlySignal<unknown>).value;
              },
            }),
        }),
    });

    expect(navigateFn).not.toHaveBeenCalled();
  });

  it('renders children with empty requires array (no entitlement check)', () => {
    const { ctx } = mockAuthContext('authenticated');
    let rendered: unknown;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        const result = ProtectedRoute({
          requires: [],
          children: () => 'main-content',
        });
        rendered = (result as ReadonlySignal<unknown>).value;
      },
    });

    expect(rendered).toBe('main-content');
  });
});
