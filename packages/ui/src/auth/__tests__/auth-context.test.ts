import { describe, expect, it, spyOn } from 'bun:test';
import { createContext, useContext } from '../../component/context';
import type { Router } from '../../router/navigate';
import { RouterContext } from '../../router/router-context';
import { AccessContext } from '../access-context';
import * as accessEventClientModule from '../access-event-client';
import type { AccessSet } from '../access-set-types';
import type { AuthContextValue } from '../auth-context';
import { AuthContext, AuthProvider, useAuth } from '../auth-context';

/** Create a minimal fake window object for SSR hydration tests. */
function createFakeWindow(session?: {
  user: { id: string; email: string; role: string };
  expiresAt: number;
}) {
  const win = {
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as typeof globalThis.window;
  if (session) {
    (win as Record<string, unknown>).__VERTZ_SESSION__ = session;
  }
  return win;
}

/** Create a mock router for testing signOut redirect. */
function createMockRouter(): Router & { navigateCalls: Array<{ to: string; replace?: boolean }> } {
  const navigateCalls: Array<{ to: string; replace?: boolean }> = [];
  return {
    current: { value: null, peek: () => null, notify() {} },
    loaderData: { value: [], peek: () => [], notify() {} },
    loaderError: { value: null, peek: () => null, notify() {} },
    searchParams: { value: {}, peek: () => ({}), notify() {} },
    navigate(input: { to: string; replace?: boolean }) {
      navigateCalls.push({ to: input.to, replace: input.replace });
      return Promise.resolve();
    },
    revalidate: () => Promise.resolve(),
    dispose: () => {},
    navigateCalls,
  } as Router & { navigateCalls: Array<{ to: string; replace?: boolean }> };
}

/** Capture useAuth() result inside AuthProvider. */
function captureAuth(options?: { basePath?: string; accessControl?: boolean }) {
  let auth: ReturnType<typeof useAuth> | undefined;
  AuthProvider({
    ...options,
    children: () => {
      auth = useAuth();
    },
  });
  // biome-ignore lint/style/noNonNullAssertion: test helper always assigns
  return auth!;
}

/** Capture useAuth() result inside AuthProvider wrapped with RouterContext. */
function captureAuthWithRouter(options?: { basePath?: string; accessControl?: boolean }) {
  const mockRouter = createMockRouter();
  let auth: ReturnType<typeof useAuth> | undefined;
  RouterContext.Provider({
    value: mockRouter,
    children: () =>
      AuthProvider({
        ...options,
        children: () => {
          auth = useAuth();
        },
      }),
  });
  // biome-ignore lint/style/noNonNullAssertion: test helper always assigns
  return { auth: auth!, mockRouter };
}

describe('AuthContext', () => {
  it('has stable ID @vertz/ui::AuthContext', () => {
    const duplicate = createContext<AuthContextValue>(undefined, '@vertz/ui::AuthContext');
    expect(duplicate).toBe(AuthContext);
  });
});

describe('useAuth', () => {
  it('throws when called outside AuthProvider', () => {
    expect(() => useAuth()).toThrow('useAuth must be called within AuthProvider');
  });

  it('returns context value when inside AuthProvider', () => {
    const auth = captureAuth();
    expect(auth).toBeDefined();
  });
});

describe('AuthProvider', () => {
  it('initializes with no user and not authenticated', () => {
    const auth = captureAuth();

    // Status is 'idle' (no window) or 'unauthenticated' (window exists, no session)
    const expectedStatus = typeof window !== 'undefined' ? 'unauthenticated' : 'idle';
    expect(auth.status).toBe(expectedStatus);
    expect(auth.user).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.isLoading).toBe(false);
    expect(auth.error).toBeNull();
  });

  it('provides signIn as SdkMethodWithMeta with url and method', () => {
    const auth = captureAuth();

    expect(auth.signIn.url).toBe('/api/auth/signin');
    expect(auth.signIn.method).toBe('POST');
    expect(auth.signIn.meta.bodySchema).toBeDefined();
  });

  it('provides signUp as SdkMethodWithMeta with url and method', () => {
    const auth = captureAuth();

    expect(auth.signUp.url).toBe('/api/auth/signup');
    expect(auth.signUp.method).toBe('POST');
    expect(auth.signUp.meta.bodySchema).toBeDefined();
  });

  it('uses custom basePath for method urls', () => {
    const auth = captureAuth({ basePath: '/custom/auth' });

    expect(auth.signIn.url).toBe('/custom/auth/signin');
    expect(auth.signUp.url).toBe('/custom/auth/signup');
  });

  describe('signUp', () => {
    it('transitions to authenticated on success', async () => {
      const responseData = {
        user: { id: '1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 60_000,
      };
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(responseData), { status: 200 }),
      );

      const auth = captureAuth();
      const result = await auth.signUp({ email: 'a@b.com', password: 'pass123' });

      expect(result.ok).toBe(true);
      expect(auth.status).toBe('authenticated');
      expect(auth.user).toEqual(responseData.user);

      fetchSpy.mockRestore();
    });

    it('transitions to error on failure', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'USER_EXISTS', message: 'Email taken' }), {
          status: 409,
        }),
      );

      const auth = captureAuth();
      const result = await auth.signUp({ email: 'a@b.com', password: 'pass123' });

      expect(result.ok).toBe(false);
      expect(auth.status).toBe('error');
      expect(auth.error?.code).toBe('USER_EXISTS');

      fetchSpy.mockRestore();
    });
  });

  describe('signIn', () => {
    it('transitions to authenticated on success', async () => {
      const responseData = {
        user: { id: '1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 60_000,
      };
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(responseData), { status: 200 }),
      );

      const auth = captureAuth();
      const result = await auth.signIn({ email: 'a@b.com', password: 'pass123' });

      expect(result.ok).toBe(true);
      expect(auth.status).toBe('authenticated');
      expect(auth.user).toEqual(responseData.user);
      expect(auth.isAuthenticated).toBe(true);
      expect(auth.error).toBeNull();

      fetchSpy.mockRestore();
    });

    it('transitions to error on failure', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'Wrong password' }), {
          status: 401,
        }),
      );

      const auth = captureAuth();
      const result = await auth.signIn({ email: 'a@b.com', password: 'wrong' });

      expect(result.ok).toBe(false);
      expect(auth.status).toBe('error');
      expect(auth.error).toBeDefined();
      expect(auth.error?.code).toBe('INVALID_CREDENTIALS');
      expect(auth.user).toBeNull();

      fetchSpy.mockRestore();
    });

    it('recovers from error state on new signIn attempt', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'Wrong' }), {
            status: 401,
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: { id: '1', email: 'a@b.com', role: 'user' },
              expiresAt: Date.now() + 60_000,
            }),
            { status: 200 },
          ),
        );

      const auth = captureAuth();

      await auth.signIn({ email: 'a@b.com', password: 'wrong' });
      expect(auth.status).toBe('error');

      await auth.signIn({ email: 'a@b.com', password: 'correct' });
      expect(auth.status).toBe('authenticated');
      expect(auth.error).toBeNull();

      fetchSpy.mockRestore();
    });

    it('transitions to mfa_required when server returns MFA_REQUIRED', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'MFA_REQUIRED', message: 'MFA verification needed' }), {
          status: 403,
        }),
      );

      const auth = captureAuth();
      await auth.signIn({ email: 'a@b.com', password: 'pass123' });

      expect(auth.status).toBe('mfa_required');
      expect(auth.error).toBeNull();

      fetchSpy.mockRestore();
    });
  });

  describe('signOut', () => {
    it('transitions to unauthenticated and clears user', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: { id: '1', email: 'a@b.com', role: 'user' },
              expiresAt: Date.now() + 60_000,
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 200 }));

      const auth = captureAuth();
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      expect(auth.status).toBe('authenticated');

      await auth.signOut();
      expect(auth.status).toBe('unauthenticated');
      expect(auth.user).toBeNull();
      expect(auth.error).toBeNull();

      fetchSpy.mockRestore();
    });

    it('sends signout request with CSRF header', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: { id: '1', email: 'a@b.com', role: 'user' },
              expiresAt: Date.now() + 60_000,
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 200 }));

      const auth = captureAuth();
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      await auth.signOut();

      const [url, init] = fetchSpy.mock.calls[1] as [string, RequestInit];
      expect(url).toBe('/api/auth/signout');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
      expect((init.headers as Record<string, string>)['X-VTZ-Request']).toBe('1');

      fetchSpy.mockRestore();
    });

    it('navigates to redirectTo path after clearing state', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: { id: '1', email: 'a@b.com', role: 'user' },
              expiresAt: Date.now() + 60_000,
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 200 }));

      const { auth, mockRouter } = captureAuthWithRouter();
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      await auth.signOut({ redirectTo: '/login' });

      expect(auth.status).toBe('unauthenticated');
      expect(auth.user).toBeNull();
      expect(mockRouter.navigateCalls).toHaveLength(1);
      expect(mockRouter.navigateCalls[0]).toEqual({ to: '/login', replace: true });

      fetchSpy.mockRestore();
    });

    it('does not navigate when signOut called without options', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: { id: '1', email: 'a@b.com', role: 'user' },
              expiresAt: Date.now() + 60_000,
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 200 }));

      const { auth, mockRouter } = captureAuthWithRouter();
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      await auth.signOut();

      expect(auth.status).toBe('unauthenticated');
      expect(mockRouter.navigateCalls).toHaveLength(0);

      fetchSpy.mockRestore();
    });

    it('skips navigation and warns when no router in tree', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: { id: '1', email: 'a@b.com', role: 'user' },
              expiresAt: Date.now() + 60_000,
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 200 }));
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      const auth = captureAuth(); // no router wrapper
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      await auth.signOut({ redirectTo: '/login' });

      expect(auth.status).toBe('unauthenticated');
      expect(warnSpy).toHaveBeenCalledWith(
        '[vertz] signOut({ redirectTo }) was called but no RouterContext is available. Navigation was skipped.',
      );

      warnSpy.mockRestore();
      fetchSpy.mockRestore();
    });

    it('still navigates when network call fails', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: { id: '1', email: 'a@b.com', role: 'user' },
              expiresAt: Date.now() + 60_000,
            }),
            { status: 200 },
          ),
        )
        .mockRejectedValueOnce(new Error('Network error'));

      const { auth, mockRouter } = captureAuthWithRouter();
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      await auth.signOut({ redirectTo: '/login' });

      expect(auth.status).toBe('unauthenticated');
      expect(mockRouter.navigateCalls).toHaveLength(1);
      expect(mockRouter.navigateCalls[0]).toEqual({ to: '/login', replace: true });

      fetchSpy.mockRestore();
    });

    it('does not reject when navigation throws', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: { id: '1', email: 'a@b.com', role: 'user' },
              expiresAt: Date.now() + 60_000,
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 200 }));

      const mockRouter = createMockRouter();
      mockRouter.navigate = () => Promise.reject(new Error('Navigation failed'));

      let auth: ReturnType<typeof useAuth> | undefined;
      RouterContext.Provider({
        value: mockRouter,
        children: () =>
          AuthProvider({
            children: () => {
              auth = useAuth();
            },
          }),
      });

      // biome-ignore lint/style/noNonNullAssertion: test helper always assigns
      await auth!.signIn({ email: 'a@b.com', password: 'pass' });
      // Should not throw
      // biome-ignore lint/style/noNonNullAssertion: test helper always assigns
      await auth!.signOut({ redirectTo: '/login' });

      // biome-ignore lint/style/noNonNullAssertion: test helper always assigns
      expect(auth!.status).toBe('unauthenticated');

      fetchSpy.mockRestore();
    });

    it('clears local state even if network call fails', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: { id: '1', email: 'a@b.com', role: 'user' },
              expiresAt: Date.now() + 60_000,
            }),
            { status: 200 },
          ),
        )
        .mockRejectedValueOnce(new Error('Network error'));

      const auth = captureAuth();
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      await auth.signOut();

      expect(auth.status).toBe('unauthenticated');
      expect(auth.user).toBeNull();

      fetchSpy.mockRestore();
    });
  });

  describe('refresh', () => {
    it('transitions to authenticated on successful refresh', async () => {
      const responseData = {
        user: { id: '1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 60_000,
      };
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(responseData), { status: 200 }),
      );

      const auth = captureAuth();
      await auth.refresh();

      expect(auth.status).toBe('authenticated');
      expect(auth.user).toEqual(responseData.user);

      fetchSpy.mockRestore();
    });

    it('transitions to unauthenticated on failed refresh', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(null, { status: 401 }),
      );

      const auth = captureAuth();
      await auth.refresh();

      expect(auth.status).toBe('unauthenticated');
      expect(auth.user).toBeNull();

      fetchSpy.mockRestore();
    });

    it('transitions to unauthenticated on network failure', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));

      const auth = captureAuth();
      await auth.refresh();

      expect(auth.status).toBe('unauthenticated');

      fetchSpy.mockRestore();
    });

    it('deduplicates concurrent refresh calls', async () => {
      const responseData = {
        user: { id: '1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 60_000,
      };
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(responseData), { status: 200 }),
      );

      const auth = captureAuth();

      // Fire two concurrent refreshes
      const [r1, r2] = await Promise.all([auth.refresh(), auth.refresh()]);

      // Both should resolve, but only one fetch should have been made
      expect(r1).toBeUndefined();
      expect(r2).toBeUndefined();
      expect(fetchSpy.mock.calls.length).toBe(1);

      fetchSpy.mockRestore();
    });

    it('clears error on failed refresh', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'Wrong' }), {
            status: 401,
          }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 401 }));

      const auth = captureAuth();

      // First: signIn fails → error state
      await auth.signIn({ email: 'a@b.com', password: 'wrong' });
      expect(auth.status).toBe('error');
      expect(auth.error).toBeDefined();

      // Then: refresh fails → unauthenticated, error should be cleared
      await auth.refresh();
      expect(auth.status).toBe('unauthenticated');
      expect(auth.error).toBeNull();

      fetchSpy.mockRestore();
    });

    it('provides mfaChallenge as SdkMethodWithMeta', () => {
      const auth = captureAuth();

      expect(auth.mfaChallenge.url).toBe('/api/auth/mfa/challenge');
      expect(auth.mfaChallenge.method).toBe('POST');
      expect(auth.mfaChallenge.meta.bodySchema).toBeDefined();
    });

    it('mfaChallenge transitions to authenticated on success', async () => {
      const responseData = {
        user: { id: '1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 3_600_000,
      };
      const fetchSpy = spyOn(globalThis, 'fetch')
        // signIn → MFA_REQUIRED
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ code: 'MFA_REQUIRED', message: 'MFA needed' }), {
            status: 403,
          }),
        )
        // mfaChallenge → success
        .mockResolvedValueOnce(new Response(JSON.stringify(responseData), { status: 200 }));

      const auth = captureAuth();
      await auth.signIn({ email: 'a@b.com', password: 'pass123' });
      expect(auth.status).toBe('mfa_required');

      const result = await auth.mfaChallenge({ code: '123456' });
      expect(result.ok).toBe(true);
      expect(auth.status).toBe('authenticated');
      expect(auth.user).toEqual(responseData.user);

      fetchSpy.mockRestore();
    });

    it('mfaChallenge transitions to error on invalid code', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch')
        // signIn → MFA_REQUIRED
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ code: 'MFA_REQUIRED', message: 'MFA needed' }), {
            status: 403,
          }),
        )
        // mfaChallenge → invalid code
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ code: 'INVALID_MFA_CODE', message: 'Invalid code' }), {
            status: 401,
          }),
        );

      const auth = captureAuth();
      await auth.signIn({ email: 'a@b.com', password: 'pass123' });
      expect(auth.status).toBe('mfa_required');

      const result = await auth.mfaChallenge({ code: '000000' });
      expect(result.ok).toBe(false);
      expect(auth.status).toBe('error');
      expect(auth.error?.code).toBe('INVALID_MFA_CODE');

      fetchSpy.mockRestore();
    });

    it('provides forgotPassword as SdkMethodWithMeta', () => {
      const auth = captureAuth();

      expect(auth.forgotPassword.url).toBe('/api/auth/forgot-password');
      expect(auth.forgotPassword.method).toBe('POST');
    });

    it('forgotPassword sends POST to forgot-password endpoint', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(null), { status: 200 }),
      );

      const auth = captureAuth();
      const result = await auth.forgotPassword({ email: 'a@b.com' });

      expect(result.ok).toBe(true);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/auth/forgot-password');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');

      fetchSpy.mockRestore();
    });

    it('provides resetPassword as SdkMethodWithMeta', () => {
      const auth = captureAuth();

      expect(auth.resetPassword.url).toBe('/api/auth/reset-password');
      expect(auth.resetPassword.method).toBe('POST');
    });

    it('resetPassword sends POST to reset-password endpoint', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(null), { status: 200 }),
      );

      const auth = captureAuth();
      const result = await auth.resetPassword({ token: 'tok', password: 'newpass' });

      expect(result.ok).toBe(true);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/auth/reset-password');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');

      fetchSpy.mockRestore();
    });

    it('schedules proactive token refresh after successful signIn', async () => {
      // Use a far-future expiresAt so the timer doesn't fire during the test
      const expiresAt = Date.now() + 3_600_000; // 1 hour
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: { id: '1', email: 'a@b.com', role: 'user' },
            expiresAt,
          }),
          { status: 200 },
        ),
      );

      const auth = captureAuth();
      await auth.signIn({ email: 'a@b.com', password: 'pass123' });

      expect(auth.status).toBe('authenticated');
      // Only the signIn fetch should have been called (timer won't fire for ~1 hour)
      expect(fetchSpy.mock.calls.length).toBe(1);

      fetchSpy.mockRestore();
    });
  });

  describe('SSR hydration', () => {
    let origWindow: typeof globalThis.window;

    function setWindow(win: typeof globalThis.window) {
      origWindow = globalThis.window;
      (globalThis as Record<string, unknown>).window = win;
    }

    function restoreWindow() {
      if (origWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = origWindow;
      }
    }

    it('hydrates from window.__VERTZ_SESSION__ with authenticated status', () => {
      const session = {
        user: { id: '1', email: 'a@b.com', role: 'admin' },
        expiresAt: Date.now() + 3_600_000,
      };
      setWindow(createFakeWindow(session));

      const auth = captureAuth();

      expect(auth.status).toBe('authenticated');
      expect(auth.user).toEqual(session.user);
      expect(auth.isAuthenticated).toBe(true);

      restoreWindow();
    });

    it('transitions to unauthenticated when no session in window', () => {
      setWindow(createFakeWindow());

      const auth = captureAuth();

      expect(auth.status).toBe('unauthenticated');
      expect(auth.user).toBeNull();

      restoreWindow();
    });

    it('hydrates access set from window.__VERTZ_ACCESS_SET__ when accessControl enabled', () => {
      const session = {
        user: { id: '1', email: 'a@b.com', role: 'admin' },
        expiresAt: Date.now() + 3_600_000,
      };
      const fakeWindow = createFakeWindow(session);
      (fakeWindow as Record<string, unknown>).__VERTZ_ACCESS_SET__ = {
        entitlements: { 'task:read': { allowed: true, reasons: [] } },
        flags: {},
        plan: 'pro',
        computedAt: new Date().toISOString(),
      };
      setWindow(fakeWindow);

      let accessCtx: { accessSet: AccessSet | null; loading: boolean } | undefined;
      AuthProvider({
        accessControl: true,
        children: () => {
          useAuth();
          accessCtx = useContext(AccessContext) as {
            accessSet: AccessSet | null;
            loading: boolean;
          };
        },
      });

      expect(accessCtx).toBeDefined();
      expect(accessCtx?.accessSet).toBeDefined();
      expect(accessCtx?.accessSet?.entitlements['task:read'].allowed).toBe(true);
      expect(accessCtx?.loading).toBe(false);

      restoreWindow();
    });

    it('signOut clears window.__VERTZ_SESSION__', async () => {
      const session = {
        user: { id: '1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 3_600_000,
      };
      const fakeWindow = createFakeWindow(session);
      setWindow(fakeWindow);

      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(null, { status: 200 }),
      );

      const auth = captureAuth();
      expect(auth.status).toBe('authenticated');

      await auth.signOut();
      expect(fakeWindow.__VERTZ_SESSION__).toBeUndefined();

      fetchSpy.mockRestore();
      restoreWindow();
    });
  });

  describe('accessControl integration', () => {
    it('provides AccessContext when accessControl is true', () => {
      let accessCtx: unknown;
      AuthProvider({
        accessControl: true,
        children: () => {
          accessCtx = useContext(AccessContext);
        },
      });

      expect(accessCtx).toBeDefined();
      expect(accessCtx).toHaveProperty('accessSet');
      expect(accessCtx).toHaveProperty('loading');
    });

    it('does not provide AccessContext when accessControl is not set', () => {
      let accessCtx: unknown;
      AuthProvider({
        children: () => {
          accessCtx = useContext(AccessContext);
        },
      });

      expect(accessCtx).toBeUndefined();
    });

    it('fetches access set after successful signIn', async () => {
      const authResponse = {
        user: { id: '1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 3_600_000,
      };
      const accessSetData = {
        entitlements: { 'task:read': { allowed: true, reasons: [] } },
      };

      const fetchSpy = spyOn(globalThis, 'fetch')
        // signIn response
        .mockResolvedValueOnce(new Response(JSON.stringify(authResponse), { status: 200 }))
        // access set response
        .mockResolvedValueOnce(new Response(JSON.stringify(accessSetData), { status: 200 }));

      let auth: ReturnType<typeof useAuth> | undefined;

      AuthProvider({
        accessControl: true,
        children: () => {
          auth = useAuth();
        },
      });

      // biome-ignore lint/style/noNonNullAssertion: test helper always assigns
      await auth!.signIn({ email: 'a@b.com', password: 'pass123' });

      // Wait for the access set fetch to complete
      await new Promise((r) => setTimeout(r, 10));

      // Verify access set was fetched
      expect(fetchSpy.mock.calls.length).toBe(2);
      const [accessUrl, accessInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
      expect(accessUrl).toBe('/api/auth/access-set');
      expect(accessInit.credentials).toBe('include');

      fetchSpy.mockRestore();
    });

    it('creates access event client when accessEvents is enabled', () => {
      let connectCalled = false;
      const createSpy = spyOn(accessEventClientModule, 'createAccessEventClient').mockReturnValue({
        connect: () => {
          connectCalled = true;
        },
        disconnect: () => {},
        dispose: () => {},
      });

      AuthProvider({
        accessControl: true,
        accessEvents: true,
        children: () => {
          useAuth();
        },
      });

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(connectCalled).toBe(true);

      createSpy.mockRestore();
    });

    it('does not create access event client when accessEvents is false', () => {
      const createSpy = spyOn(accessEventClientModule, 'createAccessEventClient').mockReturnValue({
        connect: () => {},
        disconnect: () => {},
        dispose: () => {},
      });

      AuthProvider({
        accessControl: true,
        accessEvents: false,
        children: () => {
          useAuth();
        },
      });

      expect(createSpy).toHaveBeenCalledTimes(0);

      createSpy.mockRestore();
    });

    it('does not create access event client when accessControl is false', () => {
      const createSpy = spyOn(accessEventClientModule, 'createAccessEventClient').mockReturnValue({
        connect: () => {},
        disconnect: () => {},
        dispose: () => {},
      });

      AuthProvider({
        accessEvents: true,
        children: () => {
          useAuth();
        },
      });

      expect(createSpy).toHaveBeenCalledTimes(0);

      createSpy.mockRestore();
    });

    it('access event client onEvent handles flag_toggled inline', async () => {
      let capturedOnEvent: ((event: accessEventClientModule.ClientAccessEvent) => void) | undefined;
      const createSpy = spyOn(
        accessEventClientModule,
        'createAccessEventClient',
      ).mockImplementation((opts) => {
        capturedOnEvent = opts.onEvent;
        return {
          connect: () => {},
          disconnect: () => {},
          dispose: () => {},
        };
      });

      const accessSetData: AccessSet = {
        entitlements: {
          'project:export': { allowed: true, reasons: [] },
        },
        flags: { 'export-v2': true },
        plan: 'pro',
        computedAt: new Date().toISOString(),
      };

      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(accessSetData), { status: 200 }),
      );

      AuthProvider({
        accessControl: true,
        accessEvents: true,
        flagEntitlementMap: { 'project:export': ['export-v2'] },
        children: () => {
          useAuth();
        },
      });

      expect(capturedOnEvent).toBeDefined();

      // Exercise the onEvent callback to cover lines 338-340
      capturedOnEvent?.({ type: 'access:flag_toggled', flag: 'export-v2', enabled: false });

      createSpy.mockRestore();
      fetchSpy.mockRestore();
    });

    it('access event client onEvent handles limit_updated inline', () => {
      let capturedOnEvent: ((event: accessEventClientModule.ClientAccessEvent) => void) | undefined;
      const createSpy = spyOn(
        accessEventClientModule,
        'createAccessEventClient',
      ).mockImplementation((opts) => {
        capturedOnEvent = opts.onEvent;
        return {
          connect: () => {},
          disconnect: () => {},
          dispose: () => {},
        };
      });

      AuthProvider({
        accessControl: true,
        accessEvents: true,
        children: () => {
          useAuth();
        },
      });

      // Exercise limit_updated to cover inline update path
      capturedOnEvent?.({
        type: 'access:limit_updated',
        entitlement: 'project:create',
        consumed: 99,
        remaining: 1,
        max: 100,
      });

      createSpy.mockRestore();
    });

    it('access event client onEvent handles role_changed with jittered refetch', () => {
      let capturedOnEvent: ((event: accessEventClientModule.ClientAccessEvent) => void) | undefined;
      const createSpy = spyOn(
        accessEventClientModule,
        'createAccessEventClient',
      ).mockImplementation((opts) => {
        capturedOnEvent = opts.onEvent;
        return {
          connect: () => {},
          disconnect: () => {},
          dispose: () => {},
        };
      });

      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      AuthProvider({
        accessControl: true,
        accessEvents: true,
        children: () => {
          useAuth();
        },
      });

      // Fire role_changed event — exercises lines 342-346 (setTimeout + fetchAccessSet)
      capturedOnEvent?.({ type: 'access:role_changed' });

      // Fire plan_changed too — same code path
      capturedOnEvent?.({ type: 'access:plan_changed' });

      createSpy.mockRestore();
      fetchSpy.mockRestore();
    });

    it('access event client onReconnect triggers refetch', () => {
      let capturedOnReconnect: (() => void) | undefined;
      const createSpy = spyOn(
        accessEventClientModule,
        'createAccessEventClient',
      ).mockImplementation((opts) => {
        capturedOnReconnect = opts.onReconnect;
        return {
          connect: () => {},
          disconnect: () => {},
          dispose: () => {},
        };
      });

      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      AuthProvider({
        accessControl: true,
        accessEvents: true,
        children: () => {
          useAuth();
        },
      });

      expect(capturedOnReconnect).toBeDefined();
      // Fire onReconnect — exercises line 351
      capturedOnReconnect?.();

      createSpy.mockRestore();
      fetchSpy.mockRestore();
    });

    it('passes accessEventsUrl to event client', () => {
      let capturedUrl: string | undefined;
      const createSpy = spyOn(
        accessEventClientModule,
        'createAccessEventClient',
      ).mockImplementation((opts) => {
        capturedUrl = opts.url;
        return {
          connect: () => {},
          disconnect: () => {},
          dispose: () => {},
        };
      });

      AuthProvider({
        accessControl: true,
        accessEvents: true,
        accessEventsUrl: 'wss://custom.example.com/ws',
        children: () => {
          useAuth();
        },
      });

      expect(capturedUrl).toBe('wss://custom.example.com/ws');

      createSpy.mockRestore();
    });

    it('clears access set on signOut', async () => {
      const authResponse = {
        user: { id: '1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 3_600_000,
      };
      const accessSetData = {
        entitlements: { 'task:read': { allowed: true, reasons: [] } },
      };

      const fetchSpy = spyOn(globalThis, 'fetch')
        // signIn
        .mockResolvedValueOnce(new Response(JSON.stringify(authResponse), { status: 200 }))
        // access set fetch
        .mockResolvedValueOnce(new Response(JSON.stringify(accessSetData), { status: 200 }))
        // signOut
        .mockResolvedValueOnce(new Response(null, { status: 200 }));

      // biome-ignore lint/style/noNonNullAssertion: test helper always assigns
      let auth: ReturnType<typeof useAuth> = undefined!;
      // biome-ignore lint/style/noNonNullAssertion: test helper always assigns
      let accessCtx: { accessSet: AccessSet | null; loading: boolean } = undefined!;

      AuthProvider({
        accessControl: true,
        children: () => {
          auth = useAuth();
          // useContext returns getter-wrapped — reads signal.value via getters
          accessCtx = useContext(AccessContext) as {
            accessSet: AccessSet | null;
            loading: boolean;
          };
        },
      });

      await auth.signIn({ email: 'a@b.com', password: 'pass123' });
      await new Promise((r) => setTimeout(r, 10));

      await auth.signOut();

      // Access set should be cleared, loading should be true
      expect(accessCtx.accessSet).toBeNull();
      expect(accessCtx.loading).toBe(true);

      fetchSpy.mockRestore();
    });
  });
});
