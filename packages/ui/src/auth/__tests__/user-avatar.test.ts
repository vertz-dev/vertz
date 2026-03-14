import { describe, expect, it } from 'bun:test';
import { computed, signal } from '../../runtime/signal';
import type { ReadonlySignal } from '../../runtime/signal-types';
import type { AuthContextValue } from '../auth-context';
import { AuthContext } from '../auth-context';
import type { AuthClientError, AuthStatus, User } from '../auth-types';
import { UserAvatar } from '../user-avatar';

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

describe('UserAvatar', () => {
  it('renders Avatar with src when user has avatarUrl', () => {
    const { ctx } = mockAuthContext({
      id: '1',
      email: 'jane@example.com',
      role: 'user',
      avatarUrl: '/photo.jpg',
    });
    let result: unknown;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        result = UserAvatar({});
      },
    });

    const el = (result as ReadonlySignal<Element>).value;
    const img = el.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/photo.jpg');
  });

  it('renders Avatar fallback when user has no avatarUrl', () => {
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
        result = UserAvatar({});
      },
    });

    const el = (result as ReadonlySignal<Element>).value;
    expect(el.querySelector('img')).toBeNull();
    expect(el.innerHTML).toContain('<svg');
  });

  it('updates reactively when auth user changes', () => {
    const { ctx, userSignal } = mockAuthContext({
      id: '1',
      email: 'jane@example.com',
      role: 'user',
      avatarUrl: '/jane.jpg',
    });
    let result: unknown;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        result = UserAvatar({});
      },
    });

    const sig = result as ReadonlySignal<Element>;
    expect(sig.value.querySelector('img')?.getAttribute('src')).toBe('/jane.jpg');

    // Update user — avatar should change
    userSignal.value = {
      id: '2',
      email: 'bob@example.com',
      role: 'user',
      avatarUrl: '/bob.jpg',
    };
    expect(sig.value.querySelector('img')?.getAttribute('src')).toBe('/bob.jpg');
  });

  it('uses provided user instead of auth context (static, no computed)', () => {
    const overrideUser: User = {
      id: '2',
      email: 'bob@example.com',
      role: 'user',
      avatarUrl: '/bob.jpg',
    };
    const el = UserAvatar({ user: overrideUser }) as Element;

    const img = el.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/bob.jpg');
  });

  it('passes size to Avatar', () => {
    const overrideUser: User = { id: '1', email: 'jane@example.com', role: 'user' };
    const el = UserAvatar({ user: overrideUser, size: 'lg' }) as Element;

    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('width:56px');
    expect(style).toContain('height:56px');
  });

  it('passes fallback to Avatar', () => {
    const overrideUser: User = { id: '1', email: 'jane@example.com', role: 'user' };
    const el = UserAvatar({ user: overrideUser, fallback: 'JD' }) as Element;

    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('JD');
  });

  it('throws descriptive error when no AuthProvider and no user prop', () => {
    expect(() => UserAvatar({})).toThrow(
      'UserAvatar must be used within AuthProvider, or pass a `user` prop',
    );
  });

  it('passes class to Avatar container', () => {
    const overrideUser: User = { id: '1', email: 'jane@example.com', role: 'user' };
    const el = UserAvatar({ user: overrideUser, class: 'custom-avatar' }) as Element;

    expect(el.getAttribute('class')).toBe('custom-avatar');
  });
});
