import { describe, expect, it } from 'bun:test';
import { computed, signal } from '@vertz/ui';
import type { AuthClientError, AuthContextValue, AuthStatus } from '@vertz/ui/auth';
import { AuthContext } from '@vertz/ui/auth';
import { AuthGate } from '../auth-gate';

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

describe('AuthGate', () => {
  it('renders fallback when status is idle', () => {
    const { ctx } = mockAuthContext('idle');
    let wrapper: HTMLElement | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        wrapper = AuthGate({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        });
      },
    });

    expect(wrapper?.textContent).toBe('loading-fallback');
  });

  it('renders fallback when status is loading', () => {
    const { ctx } = mockAuthContext('loading');
    let wrapper: HTMLElement | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        wrapper = AuthGate({
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
        wrapper = AuthGate({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        });
      },
    });

    expect(wrapper?.textContent).toBe('main-content');
  });

  it('renders children when status is unauthenticated', () => {
    const { ctx } = mockAuthContext('unauthenticated');
    let wrapper: HTMLElement | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        wrapper = AuthGate({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        });
      },
    });

    expect(wrapper?.textContent).toBe('main-content');
  });

  it('renders children when status is error', () => {
    const { ctx } = mockAuthContext('error');
    let wrapper: HTMLElement | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        wrapper = AuthGate({
          fallback: () => 'loading-fallback',
          children: () => 'main-content',
        });
      },
    });

    expect(wrapper?.textContent).toBe('main-content');
  });

  it('renders empty when no fallback provided and auth is loading', () => {
    const { ctx } = mockAuthContext('loading');
    let wrapper: HTMLElement | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        wrapper = AuthGate({
          children: () => 'main-content',
        });
      },
    });

    expect(wrapper?.textContent).toBe('');
  });

  it('renders children without provider (fail-open)', () => {
    const wrapper = AuthGate({
      fallback: () => 'loading-fallback',
      children: () => 'main-content',
    });

    // Without provider, should fail-open and render children via __child wrapper
    expect(wrapper.textContent).toBe('main-content');
  });
});
