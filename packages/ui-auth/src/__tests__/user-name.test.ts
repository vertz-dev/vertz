import { describe, expect, it } from 'bun:test';
import type { ReadonlySignal } from '@vertz/ui';
import { computed, signal } from '@vertz/ui';
import type { AuthClientError, AuthContextValue, AuthStatus, User } from '@vertz/ui/auth';
import { AuthContext } from '@vertz/ui/auth';
import { UserName } from '../user-name';

function mockAuthContext(user: User | null) {
  const userSignal = signal<User | null>(user);
  const statusSignal = signal<AuthStatus>(user ? 'authenticated' : 'unauthenticated');
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

  return { ctx, userSignal };
}

describe('UserName', () => {
  it('renders span with user name when name is available', () => {
    const { ctx } = mockAuthContext({
      id: '1',
      email: 'jane@example.com',
      role: 'user',
      name: 'Jane Doe',
    });
    let result: unknown;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        result = UserName({});
      },
    });

    const el = (result as ReadonlySignal<Element>).value;
    expect(el.tagName).toBe('SPAN');
    expect(el.textContent).toBe('Jane Doe');
  });

  it('renders email as fallback when no name', () => {
    const { ctx } = mockAuthContext({ id: '1', email: 'jane@example.com', role: 'user' });
    let result: unknown;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        result = UserName({});
      },
    });

    const el = (result as ReadonlySignal<Element>).value;
    expect(el.textContent).toBe('jane@example.com');
  });

  it('uses custom fallback when no name or email', () => {
    const { ctx } = mockAuthContext({ id: '1', email: '', role: 'user' });
    let result: unknown;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        result = UserName({ fallback: '—' });
      },
    });

    const el = (result as ReadonlySignal<Element>).value;
    expect(el.textContent).toBe('—');
  });

  it('updates reactively when auth user changes', () => {
    const { ctx, userSignal } = mockAuthContext({
      id: '1',
      email: 'jane@example.com',
      role: 'user',
      name: 'Jane Doe',
    });
    let result: unknown;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        result = UserName({});
      },
    });

    const sig = result as ReadonlySignal<Element>;
    expect(sig.value.textContent).toBe('Jane Doe');

    userSignal.value = { id: '1', email: 'bob@example.com', role: 'user', name: 'Bob Smith' };
    expect(sig.value.textContent).toBe('Bob Smith');
  });

  it('uses provided user instead of auth context (static, no computed)', () => {
    const overrideUser: User = {
      id: '2',
      email: 'bob@example.com',
      role: 'user',
      name: 'Bob Smith',
    };
    const el = UserName({ user: overrideUser }) as Element;

    expect(el.tagName).toBe('SPAN');
    expect(el.textContent).toBe('Bob Smith');
  });

  it('throws descriptive error when no AuthProvider and no user prop', () => {
    expect(() => UserName({})).toThrow(
      'UserName must be used within AuthProvider, or pass a `user` prop',
    );
  });

  it('applies custom class to span', () => {
    const overrideUser: User = { id: '1', email: 'jane@example.com', role: 'user', name: 'Jane' };
    const el = UserName({ user: overrideUser, class: 'custom-name' }) as Element;

    expect(el.getAttribute('class')).toBe('custom-name');
  });
});
