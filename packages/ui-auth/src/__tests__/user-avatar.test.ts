import { describe, expect, it } from 'bun:test';
import { computed, signal } from '@vertz/ui';
import type { AuthClientError, AuthContextValue, AuthStatus, User } from '@vertz/ui/auth';
import { AuthContext } from '@vertz/ui/auth';
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
    let wrapper: HTMLElement | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        wrapper = UserAvatar({});
      },
    });

    // __child wrapper contains the Avatar element
    const img = wrapper?.querySelector('img');
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
    let wrapper: HTMLElement | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        wrapper = UserAvatar({});
      },
    });

    // img is always in DOM but hidden when no src
    const img = wrapper?.querySelector('img');
    expect(img?.getAttribute('style')).toContain('display:none');
    expect(wrapper?.innerHTML).toContain('<svg');
  });

  it('updates reactively when auth user changes', () => {
    const { ctx, userSignal } = mockAuthContext({
      id: '1',
      email: 'jane@example.com',
      role: 'user',
      avatarUrl: '/jane.jpg',
    });
    let wrapper: HTMLElement | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        wrapper = UserAvatar({});
      },
    });

    expect(wrapper?.querySelector('img')?.getAttribute('src')).toBe('/jane.jpg');

    userSignal.value = {
      id: '2',
      email: 'bob@example.com',
      role: 'user',
      avatarUrl: '/bob.jpg',
    };
    expect(wrapper?.querySelector('img')?.getAttribute('src')).toBe('/bob.jpg');
  });

  it('reuses the same img element when avatarUrl changes (in-place update)', () => {
    const { ctx, userSignal } = mockAuthContext({
      id: '1',
      email: 'jane@example.com',
      role: 'user',
      avatarUrl: '/jane.jpg',
    });
    let wrapper: HTMLElement | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        wrapper = UserAvatar({});
      },
    });

    const img1 = wrapper?.querySelector('img');
    expect(img1).not.toBeNull();
    expect(img1?.getAttribute('src')).toBe('/jane.jpg');

    // Change avatar URL — img element should be reused (in-place attribute update)
    userSignal.value = {
      id: '1',
      email: 'jane@example.com',
      role: 'user',
      avatarUrl: '/jane-new.jpg',
    };

    const img2 = wrapper?.querySelector('img');
    expect(img2).not.toBeNull();
    expect(img2?.getAttribute('src')).toBe('/jane-new.jpg');
    expect(img2).toBe(img1); // Same DOM element — not rebuilt
  });

  it('uses provided user instead of auth context (static, no __child)', () => {
    const overrideUser: User = {
      id: '2',
      email: 'bob@example.com',
      role: 'user',
      avatarUrl: '/bob.jpg',
    };
    const el = UserAvatar({ user: overrideUser });

    const img = el.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/bob.jpg');
  });

  it('passes size to Avatar', () => {
    const overrideUser: User = { id: '1', email: 'jane@example.com', role: 'user' };
    const el = UserAvatar({ user: overrideUser, size: 'lg' });

    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('width:56px');
    expect(style).toContain('height:56px');
  });

  it('passes fallback to Avatar', () => {
    const overrideUser: User = { id: '1', email: 'jane@example.com', role: 'user' };
    const el = UserAvatar({ user: overrideUser, fallback: 'JD' });

    // img is always in DOM but hidden when no src
    const img = el.querySelector('img');
    expect(img?.getAttribute('style')).toContain('display:none');
    expect(el.textContent).toBe('JD');
  });

  it('throws descriptive error when no AuthProvider and no user prop', () => {
    expect(() => UserAvatar({})).toThrow(
      'UserAvatar must be used within AuthProvider, or pass a `user` prop',
    );
  });

  it('passes class to Avatar container', () => {
    const overrideUser: User = { id: '1', email: 'jane@example.com', role: 'user' };
    const el = UserAvatar({ user: overrideUser, class: 'custom-avatar' });

    expect(el.getAttribute('class')).toBe('custom-avatar');
  });

  it('renders SVG fallback when auth user is null (logged out)', () => {
    const { ctx } = mockAuthContext(null);
    let wrapper: HTMLElement | undefined;

    AuthContext.Provider({
      value: ctx,
      children: () => {
        wrapper = UserAvatar({});
      },
    });

    // img is always in DOM but hidden when no src
    const img = wrapper?.querySelector('img');
    expect(img?.getAttribute('style')).toContain('display:none');
    expect(wrapper?.innerHTML).toContain('<svg');
  });
});
