import { describe, expect, it } from 'bun:test';
import { computed, signal } from '../../runtime/signal';
import type { ReadonlySignal } from '../../runtime/signal-types';
import type { AuthContextValue } from '../auth-context';
import { AuthContext } from '../auth-context';
import { AuthGate } from '../auth-gate';
import type { AuthClientError, AuthStatus } from '../auth-types';

/** Create a minimal mock AuthContextValue with controllable status. */
function mockAuthContext(status: AuthStatus) {
  const statusSignal = signal<AuthStatus>(status);
  const userSignal = signal(null);
  const errorSignal = signal<AuthClientError | null>(null);

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
  };

  return { ctx, statusSignal };
}

describe('AuthGate', () => {
  it('renders fallback when status is idle', () => {
    const { ctx } = mockAuthContext('idle');
    let rendered: string | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        const result = AuthGate({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        });
        // The result is a computed signal
        rendered = (result as ReadonlySignal<unknown>).value as string;
      },
    });

    expect(rendered).toBe('loading-fallback');
  });

  it('renders fallback when status is loading', () => {
    const { ctx } = mockAuthContext('loading');
    let rendered: string | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        const result = AuthGate({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        });
        rendered = (result as ReadonlySignal<unknown>).value as string;
      },
    });

    expect(rendered).toBe('loading-fallback');
  });

  it('renders children when status is authenticated', () => {
    const { ctx } = mockAuthContext('authenticated');
    let rendered: string | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        const result = AuthGate({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        });
        rendered = (result as ReadonlySignal<unknown>).value as string;
      },
    });

    expect(rendered).toBe('main-content');
  });

  it('renders children when status is unauthenticated', () => {
    const { ctx } = mockAuthContext('unauthenticated');
    let rendered: string | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        const result = AuthGate({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        });
        rendered = (result as ReadonlySignal<unknown>).value as string;
      },
    });

    expect(rendered).toBe('main-content');
  });

  it('renders children when status is error', () => {
    const { ctx } = mockAuthContext('error');
    let rendered: string | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        const result = AuthGate({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        });
        rendered = (result as ReadonlySignal<unknown>).value as string;
      },
    });

    expect(rendered).toBe('main-content');
  });

  it('renders null fallback when no fallback provided and auth is loading', () => {
    const { ctx } = mockAuthContext('loading');
    let rendered: unknown;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        const result = AuthGate({
          children: () => 'main-content',
        });
        rendered = (result as ReadonlySignal<unknown>).value;
      },
    });

    expect(rendered).toBeNull();
  });

  it('renders children without provider (fail-open)', () => {
    const result = AuthGate({
      fallback: () => 'loading-fallback',
      children: () => 'main-content',
    });

    // Without provider, should fail-open and render children
    expect(result).toBe('main-content');
  });
});
