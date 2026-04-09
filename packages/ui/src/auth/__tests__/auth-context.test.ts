import { describe, expect, it, mock, spyOn } from '@vertz/test';
import { err, ok } from '@vertz/fetch';
import { createContext, useContext } from '../../component/context';
import type { Router } from '../../router/navigate';
import { RouterContext } from '../../router/router-context';
import { AccessContext } from '../access-context';
import * as accessEventClientModule from '../access-event-client';
import type { AccessSet } from '../access-set-types';
import type { AuthContextValue, AuthSdk } from '../auth-context';
import { AuthContext, AuthProvider, useAuth } from '../auth-context';
import type { AuthResponse, SignInInput, SignUpInput } from '../auth-types';

// --- Mock AuthSdk factory ---

function createMockAuthSdk(overrides?: Partial<AuthSdk>): AuthSdk {
  const defaultSignIn = Object.assign(
    mock(async (_body: SignInInput) =>
      ok<AuthResponse, Error>({
        user: { id: '1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 60_000,
      }),
    ),
    { url: '/api/auth/signin', method: 'POST' },
  );

  const defaultSignUp = Object.assign(
    mock(async (_body: SignUpInput) =>
      ok<AuthResponse, Error>({
        user: { id: '1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 60_000,
      }),
    ),
    { url: '/api/auth/signup', method: 'POST' },
  );

  const defaultSignOut = mock(async () => ok<unknown, Error>({ ok: true }));

  const defaultRefresh = mock(async () =>
    ok<AuthResponse, Error>({
      user: { id: '1', email: 'a@b.com', role: 'user' },
      expiresAt: Date.now() + 60_000,
    }),
  );

  const defaultProviders = mock(async () =>
    ok<{ id: string; name: string; authUrl: string }[], Error>([]),
  );

  return {
    signIn: overrides?.signIn ?? defaultSignIn,
    signUp: overrides?.signUp ?? defaultSignUp,
    signOut: overrides?.signOut ?? defaultSignOut,
    refresh: overrides?.refresh ?? defaultRefresh,
    providers: overrides?.providers ?? defaultProviders,
  };
}

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
function captureAuth(options?: { auth?: AuthSdk; basePath?: string; accessControl?: boolean }) {
  const sdk = options?.auth ?? createMockAuthSdk();
  let auth: ReturnType<typeof useAuth> | undefined;
  AuthProvider({
    auth: sdk,
    basePath: options?.basePath,
    accessControl: options?.accessControl,
    children: () => {
      auth = useAuth();
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test helper always assigns
  return auth!;
}

/** Capture useAuth() result inside AuthProvider wrapped with RouterContext. */
function captureAuthWithRouter(options?: {
  auth?: AuthSdk;
  basePath?: string;
  accessControl?: boolean;
}) {
  const sdk = options?.auth ?? createMockAuthSdk();
  const mockRouter = createMockRouter();
  let auth: ReturnType<typeof useAuth> | undefined;
  RouterContext.Provider({
    value: mockRouter,
    children: () =>
      AuthProvider({
        auth: sdk,
        basePath: options?.basePath,
        accessControl: options?.accessControl,
        children: () => {
          auth = useAuth();
        },
      }),
  });
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test helper always assigns
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

    // Status is always 'idle' initially — refresh is deferred via setTimeout(0)
    expect(auth.status).toBe('idle');
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

  it('uses SDK urls for method endpoints', () => {
    const sdk = createMockAuthSdk();
    // Override URLs on the SDK methods
    const customSignIn = Object.assign(sdk.signIn, {
      url: '/custom/auth/signin',
      method: 'POST',
    });
    const customSignUp = Object.assign(sdk.signUp, {
      url: '/custom/auth/signup',
      method: 'POST',
    });
    const customSdk = { ...sdk, signIn: customSignIn, signUp: customSignUp };

    const auth = captureAuth({ auth: customSdk });

    expect(auth.signIn.url).toBe('/custom/auth/signin');
    expect(auth.signUp.url).toBe('/custom/auth/signup');
  });

  it('delegates signIn to the SDK method', async () => {
    const signInFn = mock(async (body: SignInInput) =>
      ok<AuthResponse, Error>({
        user: { id: '1', email: body.email, role: 'user' },
        expiresAt: Date.now() + 60_000,
      }),
    );
    const sdkSignIn = Object.assign(signInFn, {
      url: '/api/auth/signin',
      method: 'POST',
    });
    const sdk = createMockAuthSdk({ signIn: sdkSignIn });

    const auth = captureAuth({ auth: sdk });
    await auth.signIn({ email: 'a@b.com', password: 'pass' });

    expect(signInFn).toHaveBeenCalledTimes(1);
    expect(signInFn).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pass' });
  });

  it('delegates signUp to the SDK method', async () => {
    const signUpFn = mock(async (body: SignUpInput) =>
      ok<AuthResponse, Error>({
        user: { id: '1', email: body.email, role: 'user' },
        expiresAt: Date.now() + 60_000,
      }),
    );
    const sdkSignUp = Object.assign(signUpFn, {
      url: '/api/auth/signup',
      method: 'POST',
    });
    const sdk = createMockAuthSdk({ signUp: sdkSignUp });

    const auth = captureAuth({ auth: sdk });
    await auth.signUp({ email: 'a@b.com', password: 'pass1234' });

    expect(signUpFn).toHaveBeenCalledTimes(1);
    expect(signUpFn).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pass1234' });
  });

  describe('signUp', () => {
    it('transitions to authenticated on success', async () => {
      const responseData = {
        user: { id: '1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 60_000,
      };
      const sdk = createMockAuthSdk({
        signUp: Object.assign(
          mock(async () => ok<AuthResponse, Error>(responseData)),
          { url: '/api/auth/signup', method: 'POST' },
        ),
      });

      const auth = captureAuth({ auth: sdk });
      const result = await auth.signUp({ email: 'a@b.com', password: 'pass123' });

      expect(result.ok).toBe(true);
      expect(auth.status).toBe('authenticated');
      expect(auth.user).toEqual(responseData.user);
    });

    it('transitions to error on failure', async () => {
      const sdk = createMockAuthSdk({
        signUp: Object.assign(
          mock(async () =>
            err<AuthResponse, Error>(
              Object.assign(new Error('Email taken'), {
                code: 'USER_EXISTS' as const,
                statusCode: 409,
              }),
            ),
          ),
          { url: '/api/auth/signup', method: 'POST' },
        ),
      });

      const auth = captureAuth({ auth: sdk });
      const result = await auth.signUp({ email: 'a@b.com', password: 'pass123' });

      expect(result.ok).toBe(false);
      expect(auth.status).toBe('error');
      expect(auth.error?.code).toBe('USER_EXISTS');
    });
  });

  describe('signIn', () => {
    it('transitions to authenticated on success', async () => {
      const responseData = {
        user: { id: '1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 60_000,
      };
      const sdk = createMockAuthSdk({
        signIn: Object.assign(
          mock(async () => ok<AuthResponse, Error>(responseData)),
          { url: '/api/auth/signin', method: 'POST' },
        ),
      });

      const auth = captureAuth({ auth: sdk });
      const result = await auth.signIn({ email: 'a@b.com', password: 'pass123' });

      expect(result.ok).toBe(true);
      expect(auth.status).toBe('authenticated');
      expect(auth.user).toEqual(responseData.user);
      expect(auth.isAuthenticated).toBe(true);
      expect(auth.error).toBeNull();
    });

    it('transitions to error on failure', async () => {
      const sdk = createMockAuthSdk({
        signIn: Object.assign(
          mock(async () =>
            err<AuthResponse, Error>(
              Object.assign(new Error('Wrong password'), {
                code: 'INVALID_CREDENTIALS' as const,
                statusCode: 401,
              }),
            ),
          ),
          { url: '/api/auth/signin', method: 'POST' },
        ),
      });

      const auth = captureAuth({ auth: sdk });
      const result = await auth.signIn({ email: 'a@b.com', password: 'wrong' });

      expect(result.ok).toBe(false);
      expect(auth.status).toBe('error');
      expect(auth.error).toBeDefined();
      expect(auth.error?.code).toBe('INVALID_CREDENTIALS');
      expect(auth.user).toBeNull();
    });

    it('recovers from error state on new signIn attempt', async () => {
      let callCount = 0;
      const sdk = createMockAuthSdk({
        signIn: Object.assign(
          mock(async () => {
            callCount++;
            if (callCount === 1) {
              return err<AuthResponse, Error>(
                Object.assign(new Error('Wrong'), {
                  code: 'INVALID_CREDENTIALS' as const,
                  statusCode: 401,
                }),
              );
            }
            return ok<AuthResponse, Error>({
              user: { id: '1', email: 'a@b.com', role: 'user' },
              expiresAt: Date.now() + 60_000,
            });
          }),
          { url: '/api/auth/signin', method: 'POST' },
        ),
      });

      const auth = captureAuth({ auth: sdk });

      await auth.signIn({ email: 'a@b.com', password: 'wrong' });
      expect(auth.status).toBe('error');

      await auth.signIn({ email: 'a@b.com', password: 'correct' });
      expect(auth.status).toBe('authenticated');
      expect(auth.error).toBeNull();
    });

    it('transitions to mfa_required when SDK returns MFA_REQUIRED', async () => {
      const sdk = createMockAuthSdk({
        signIn: Object.assign(
          mock(async () =>
            err<AuthResponse, Error>(
              Object.assign(new Error('MFA verification needed'), {
                code: 'MFA_REQUIRED' as const,
                statusCode: 403,
              }),
            ),
          ),
          { url: '/api/auth/signin', method: 'POST' },
        ),
      });

      const auth = captureAuth({ auth: sdk });
      await auth.signIn({ email: 'a@b.com', password: 'pass123' });

      expect(auth.status).toBe('mfa_required');
      expect(auth.error).toBeNull();
    });
  });

  describe('signOut', () => {
    it('transitions to unauthenticated and clears user', async () => {
      const sdk = createMockAuthSdk();

      const auth = captureAuth({ auth: sdk });
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      expect(auth.status).toBe('authenticated');

      await auth.signOut();
      expect(auth.status).toBe('unauthenticated');
      expect(auth.user).toBeNull();
      expect(auth.error).toBeNull();
    });

    it('delegates signOut to the SDK method', async () => {
      const signOutFn = mock(async () => ok<unknown, Error>({ ok: true }));
      const sdk = createMockAuthSdk({ signOut: signOutFn });

      const auth = captureAuth({ auth: sdk });
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      await auth.signOut();

      expect(signOutFn).toHaveBeenCalledTimes(1);
    });

    it('navigates to redirectTo path after clearing state', async () => {
      const sdk = createMockAuthSdk();
      const { auth, mockRouter } = captureAuthWithRouter({ auth: sdk });
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      await auth.signOut({ redirectTo: '/login' });

      expect(auth.status).toBe('unauthenticated');
      expect(auth.user).toBeNull();
      expect(mockRouter.navigateCalls).toHaveLength(1);
      expect(mockRouter.navigateCalls[0]).toEqual({ to: '/login', replace: true });
    });

    it('does not navigate when signOut called without options', async () => {
      const sdk = createMockAuthSdk();
      const { auth, mockRouter } = captureAuthWithRouter({ auth: sdk });
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      await auth.signOut();

      expect(auth.status).toBe('unauthenticated');
      expect(mockRouter.navigateCalls).toHaveLength(0);
    });

    it('skips navigation and warns when no router in tree', async () => {
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      const sdk = createMockAuthSdk();
      const auth = captureAuth({ auth: sdk }); // no router wrapper
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      await auth.signOut({ redirectTo: '/login' });

      expect(auth.status).toBe('unauthenticated');
      expect(warnSpy).toHaveBeenCalledWith(
        '[vertz] signOut({ redirectTo }) was called but no RouterContext is available. Navigation was skipped.',
      );

      warnSpy.mockRestore();
    });

    it('does not navigate when redirectTo is empty string', async () => {
      const sdk = createMockAuthSdk();
      const { auth, mockRouter } = captureAuthWithRouter({ auth: sdk });
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      await auth.signOut({ redirectTo: '' });

      expect(auth.status).toBe('unauthenticated');
      expect(mockRouter.navigateCalls).toHaveLength(0);
    });

    it('still navigates when SDK signOut throws', async () => {
      const sdk = createMockAuthSdk({
        signOut: mock(async () => {
          throw new Error('Network error');
        }),
      });
      const { auth, mockRouter } = captureAuthWithRouter({ auth: sdk });
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      await auth.signOut({ redirectTo: '/login' });

      expect(auth.status).toBe('unauthenticated');
      expect(mockRouter.navigateCalls).toHaveLength(1);
      expect(mockRouter.navigateCalls[0]).toEqual({ to: '/login', replace: true });
    });

    it('does not reject when navigation throws', async () => {
      const mockRouter = createMockRouter();
      mockRouter.navigate = () => Promise.reject(new Error('Navigation failed'));

      const sdk = createMockAuthSdk();
      let auth: ReturnType<typeof useAuth> | undefined;
      RouterContext.Provider({
        value: mockRouter,
        children: () =>
          AuthProvider({
            auth: sdk,
            children: () => {
              auth = useAuth();
            },
          }),
      });

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test helper always assigns
      await auth!.signIn({ email: 'a@b.com', password: 'pass' });
      // Should not throw
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test helper always assigns
      await auth!.signOut({ redirectTo: '/login' });

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test helper always assigns
      expect(auth!.status).toBe('unauthenticated');
    });

    it('clears local state even if SDK signOut throws', async () => {
      const sdk = createMockAuthSdk({
        signOut: mock(async () => {
          throw new Error('Network error');
        }),
      });

      const auth = captureAuth({ auth: sdk });
      await auth.signIn({ email: 'a@b.com', password: 'pass' });
      await auth.signOut();

      expect(auth.status).toBe('unauthenticated');
      expect(auth.user).toBeNull();
    });
  });

  describe('refresh', () => {
    it('transitions to authenticated on successful refresh', async () => {
      const responseData = {
        user: { id: '1', email: 'a@b.com', role: 'user' },
        expiresAt: Date.now() + 60_000,
      };
      const sdk = createMockAuthSdk({
        refresh: mock(async () => ok<AuthResponse, Error>(responseData)),
      });

      const auth = captureAuth({ auth: sdk });
      await auth.refresh();

      expect(auth.status).toBe('authenticated');
      expect(auth.user).toEqual(responseData.user);
    });

    it('transitions to unauthenticated on failed refresh', async () => {
      const sdk = createMockAuthSdk({
        refresh: mock(async () =>
          err<AuthResponse, Error>(Object.assign(new Error('Unauthorized'), { statusCode: 401 })),
        ),
      });

      const auth = captureAuth({ auth: sdk });
      await auth.refresh();

      expect(auth.status).toBe('unauthenticated');
      expect(auth.user).toBeNull();
    });

    it('transitions to unauthenticated on network failure', async () => {
      const sdk = createMockAuthSdk({
        refresh: mock(async () => {
          throw new Error('offline');
        }),
      });

      const auth = captureAuth({ auth: sdk });
      await auth.refresh();

      expect(auth.status).toBe('unauthenticated');
    });

    it('deduplicates concurrent refresh calls', async () => {
      const refreshFn = mock(async () =>
        ok<AuthResponse, Error>({
          user: { id: '1', email: 'a@b.com', role: 'user' },
          expiresAt: Date.now() + 60_000,
        }),
      );
      const sdk = createMockAuthSdk({ refresh: refreshFn });

      const auth = captureAuth({ auth: sdk });

      // Fire two concurrent refreshes
      const [r1, r2] = await Promise.all([auth.refresh(), auth.refresh()]);

      // Both should resolve, but only one SDK call should have been made
      expect(r1).toBeUndefined();
      expect(r2).toBeUndefined();
      expect(refreshFn).toHaveBeenCalledTimes(1);
    });

    it('clears error on failed refresh', async () => {
      const sdk = createMockAuthSdk({
        signIn: Object.assign(
          mock(async () =>
            err<AuthResponse, Error>(
              Object.assign(new Error('Wrong'), {
                code: 'INVALID_CREDENTIALS' as const,
                statusCode: 401,
              }),
            ),
          ),
          { url: '/api/auth/signin', method: 'POST' },
        ),
        refresh: mock(async () =>
          err<AuthResponse, Error>(Object.assign(new Error('Unauthorized'), { statusCode: 401 })),
        ),
      });

      const auth = captureAuth({ auth: sdk });

      // First: signIn fails → error state
      await auth.signIn({ email: 'a@b.com', password: 'wrong' });
      expect(auth.status).toBe('error');
      expect(auth.error).toBeDefined();

      // Then: refresh fails → unauthenticated, error should be cleared
      await auth.refresh();
      expect(auth.status).toBe('unauthenticated');
      expect(auth.error).toBeNull();
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
      // MFA challenge still uses direct fetch (not SDK)
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(responseData), { status: 200 }),
      );

      // signIn returns MFA_REQUIRED
      const sdk = createMockAuthSdk({
        signIn: Object.assign(
          mock(async () =>
            err<AuthResponse, Error>(
              Object.assign(new Error('MFA needed'), {
                code: 'MFA_REQUIRED' as const,
                statusCode: 403,
              }),
            ),
          ),
          { url: '/api/auth/signin', method: 'POST' },
        ),
      });

      const auth = captureAuth({ auth: sdk });
      await auth.signIn({ email: 'a@b.com', password: 'pass123' });
      expect(auth.status).toBe('mfa_required');

      const result = await auth.mfaChallenge({ code: '123456' });
      expect(result.ok).toBe(true);
      expect(auth.status).toBe('authenticated');
      expect(auth.user).toEqual(responseData.user);

      fetchSpy.mockRestore();
    });

    it('mfaChallenge transitions to error on invalid code', async () => {
      // MFA challenge still uses direct fetch (not SDK)
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'INVALID_MFA_CODE', message: 'Invalid code' }), {
          status: 401,
        }),
      );

      // signIn returns MFA_REQUIRED
      const sdk = createMockAuthSdk({
        signIn: Object.assign(
          mock(async () =>
            err<AuthResponse, Error>(
              Object.assign(new Error('MFA needed'), {
                code: 'MFA_REQUIRED' as const,
                statusCode: 403,
              }),
            ),
          ),
          { url: '/api/auth/signin', method: 'POST' },
        ),
      });

      const auth = captureAuth({ auth: sdk });
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
      const signInFn = mock(async () =>
        ok<AuthResponse, Error>({
          user: { id: '1', email: 'a@b.com', role: 'user' },
          expiresAt,
        }),
      );
      const sdk = createMockAuthSdk({
        signIn: Object.assign(signInFn, { url: '/api/auth/signin', method: 'POST' }),
      });

      const auth = captureAuth({ auth: sdk });
      await auth.signIn({ email: 'a@b.com', password: 'pass123' });

      expect(auth.status).toBe('authenticated');
      // Only the signIn call should have been made (timer won't fire for ~1 hour)
      expect(signInFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('SSR — partial/undefined auth SDK (#2302)', () => {
    it('does not crash when auth.signIn is undefined (V8 isolate)', () => {
      // In the Rust V8 isolate, auth SDK methods may be entirely undefined
      const partialSdk = {
        signIn: undefined,
        signUp: undefined,
        signOut: mock(async () => ok<unknown, Error>({ ok: true })),
        refresh: mock(async () =>
          ok<AuthResponse, Error>({
            user: { id: '1', email: 'a@b.com', role: 'user' },
            expiresAt: Date.now() + 60_000,
          }),
        ),
      } as unknown as AuthSdk;

      // This crashes before the fix: TypeError: Cannot read properties of undefined (reading 'url')
      expect(() => captureAuth({ auth: partialSdk })).not.toThrow();
    });

    it('does not crash when auth SDK methods lack url/method metadata', () => {
      const partialSdk: AuthSdk = {
        signIn: Object.assign(
          mock(async () =>
            ok<AuthResponse, Error>({
              user: { id: '1', email: 'a@b.com', role: 'user' },
              expiresAt: Date.now() + 60_000,
            }),
          ),
        ) as AuthSdk['signIn'],
        signUp: Object.assign(
          mock(async () =>
            ok<AuthResponse, Error>({
              user: { id: '1', email: 'a@b.com', role: 'user' },
              expiresAt: Date.now() + 60_000,
            }),
          ),
        ) as AuthSdk['signUp'],
        signOut: mock(async () => ok<unknown, Error>({ ok: true })),
        refresh: mock(async () =>
          ok<AuthResponse, Error>({
            user: { id: '1', email: 'a@b.com', role: 'user' },
            expiresAt: Date.now() + 60_000,
          }),
        ),
      };

      expect(() => captureAuth({ auth: partialSdk })).not.toThrow();
    });

    it('defaults signIn/signUp url to empty string and method to POST when metadata missing', () => {
      const partialSdk = {
        signIn: undefined,
        signUp: undefined,
        signOut: mock(async () => ok<unknown, Error>({ ok: true })),
        refresh: mock(async () =>
          ok<AuthResponse, Error>({
            user: { id: '1', email: 'a@b.com', role: 'user' },
            expiresAt: Date.now() + 60_000,
          }),
        ),
      } as unknown as AuthSdk;

      const auth = captureAuth({ auth: partialSdk });

      expect(auth.signIn.url).toBe('');
      expect(auth.signIn.method).toBe('POST');
      expect(auth.signUp.url).toBe('');
      expect(auth.signUp.method).toBe('POST');
    });

    it('returns error result when signIn is called with undefined SDK method', async () => {
      const partialSdk = {
        signIn: undefined,
        signUp: undefined,
        signOut: mock(async () => ok<unknown, Error>({ ok: true })),
        refresh: mock(async () =>
          ok<AuthResponse, Error>({
            user: { id: '1', email: 'a@b.com', role: 'user' },
            expiresAt: Date.now() + 60_000,
          }),
        ),
      } as unknown as AuthSdk;

      const auth = captureAuth({ auth: partialSdk });
      const result = await auth.signIn({ email: 'a@b.com', password: 'pass' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not available');
      }
    });

    it('returns error result when signUp is called with undefined SDK method', async () => {
      const partialSdk = {
        signIn: undefined,
        signUp: undefined,
        signOut: mock(async () => ok<unknown, Error>({ ok: true })),
        refresh: mock(async () =>
          ok<AuthResponse, Error>({
            user: { id: '1', email: 'a@b.com', role: 'user' },
            expiresAt: Date.now() + 60_000,
          }),
        ),
      } as unknown as AuthSdk;

      const auth = captureAuth({ auth: partialSdk });
      const result = await auth.signUp({ email: 'a@b.com', password: 'pass1234' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not available');
      }
    });

    it('still delegates to SDK when url/method are present', () => {
      const sdk = createMockAuthSdk();
      const auth = captureAuth({ auth: sdk });

      // Normal behavior preserved — SDK-provided metadata passes through
      expect(auth.signIn.url).toBe('/api/auth/signin');
      expect(auth.signIn.method).toBe('POST');
      expect(auth.signUp.url).toBe('/api/auth/signup');
      expect(auth.signUp.method).toBe('POST');
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

    it('stays idle when no session in window (refresh is deferred)', () => {
      setWindow(createFakeWindow());

      const auth = captureAuth();

      // With no SSR session, refresh is scheduled via setTimeout(0),
      // so status stays 'idle' synchronously — SSR renders loading state.
      expect(auth.status).toBe('idle');
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
      const sdk = createMockAuthSdk();
      AuthProvider({
        auth: sdk,
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

      const auth = captureAuth();
      expect(auth.status).toBe('authenticated');

      await auth.signOut();
      expect(fakeWindow.__VERTZ_SESSION__).toBeUndefined();

      restoreWindow();
    });
  });

  describe('providers', () => {
    it('exposes providers as empty array initially', () => {
      const auth = captureAuth();
      expect(auth.providers).toEqual([]);
    });

    it('fetches providers from SDK on mount', async () => {
      const providerData = [
        { id: 'github', name: 'GitHub', authUrl: '/api/auth/oauth/github' },
        { id: 'google', name: 'Google', authUrl: '/api/auth/oauth/google' },
      ];

      const providersFn = mock(async () => ok(providerData));
      const sdk = createMockAuthSdk({ providers: providersFn });

      const auth = captureAuth({ auth: sdk });

      // Wait for deferred fetch (setTimeout(0) + promise resolution)
      await new Promise((r) => setTimeout(r, 50));

      expect(auth.providers).toEqual(providerData);
      expect(providersFn).toHaveBeenCalledTimes(1);
    });

    it('stays empty on SDK failure (silent failure)', async () => {
      const sdk = createMockAuthSdk({
        providers: mock(async () => {
          throw new Error('Network error');
        }),
      });

      const auth = captureAuth({ auth: sdk });

      // Wait for deferred fetch
      await new Promise((r) => setTimeout(r, 50));

      expect(auth.providers).toEqual([]);
    });

    it('stays empty when providers not on SDK', async () => {
      const sdk = createMockAuthSdk();
      sdk.providers = undefined;

      const auth = captureAuth({ auth: sdk });

      // Wait for deferred fetch
      await new Promise((r) => setTimeout(r, 50));

      expect(auth.providers).toEqual([]);
    });
  });

  describe('accessControl integration', () => {
    it('provides AccessContext when accessControl is true', () => {
      let accessCtx: unknown;
      const sdk = createMockAuthSdk();
      AuthProvider({
        auth: sdk,
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
      const sdk = createMockAuthSdk();
      AuthProvider({
        auth: sdk,
        children: () => {
          accessCtx = useContext(AccessContext);
        },
      });

      expect(accessCtx).toBeUndefined();
    });

    it('fetches access set after successful signIn', async () => {
      const accessSetData = {
        entitlements: { 'task:read': { allowed: true, reasons: [] } },
      };

      const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const urlStr = typeof url === 'string' ? url : (url as Request).url;
        if (urlStr.includes('/access-set')) {
          return new Response(JSON.stringify(accessSetData), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      });

      const sdk = createMockAuthSdk();
      let auth: ReturnType<typeof useAuth> | undefined;

      AuthProvider({
        auth: sdk,
        accessControl: true,
        children: () => {
          auth = useAuth();
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test helper always assigns
      await auth!.signIn({ email: 'a@b.com', password: 'pass123' });

      // Wait for the access set fetch to complete
      await new Promise((r) => setTimeout(r, 50));

      // Verify access set was fetched — find the access-set call among all calls
      const accessSetCall = fetchSpy.mock.calls.find((call) => {
        const u = typeof call[0] === 'string' ? call[0] : (call[0] as Request).url;
        return u.includes('/access-set');
      });
      expect(accessSetCall).toBeDefined();
      const [accessUrl, accessInit] = accessSetCall as [string, RequestInit];
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

      const sdk = createMockAuthSdk();
      AuthProvider({
        auth: sdk,
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

      const sdk = createMockAuthSdk();
      AuthProvider({
        auth: sdk,
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

      const sdk = createMockAuthSdk();
      AuthProvider({
        auth: sdk,
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

      const sdk = createMockAuthSdk();
      AuthProvider({
        auth: sdk,
        accessControl: true,
        accessEvents: true,
        flagEntitlementMap: { 'project:export': ['export-v2'] },
        children: () => {
          useAuth();
        },
      });

      expect(capturedOnEvent).toBeDefined();

      capturedOnEvent?.({
        type: 'access:flag_toggled',
        resourceType: 'tenant',
        resourceId: 'org-1',
        flag: 'export-v2',
        enabled: false,
      });

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

      const sdk = createMockAuthSdk();
      AuthProvider({
        auth: sdk,
        accessControl: true,
        accessEvents: true,
        children: () => {
          useAuth();
        },
      });

      capturedOnEvent?.({
        type: 'access:limit_updated',
        resourceType: 'tenant',
        resourceId: 'org-1',
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

      const sdk = createMockAuthSdk();
      AuthProvider({
        auth: sdk,
        accessControl: true,
        accessEvents: true,
        children: () => {
          useAuth();
        },
      });

      capturedOnEvent?.({ type: 'access:role_changed' });
      capturedOnEvent?.({
        type: 'access:plan_changed',
        resourceType: 'tenant',
        resourceId: 'org-1',
      });

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

      const sdk = createMockAuthSdk();
      AuthProvider({
        auth: sdk,
        accessControl: true,
        accessEvents: true,
        children: () => {
          useAuth();
        },
      });

      expect(capturedOnReconnect).toBeDefined();
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

      const sdk = createMockAuthSdk();
      AuthProvider({
        auth: sdk,
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
      const accessSetData = {
        entitlements: { 'task:read': { allowed: true, reasons: [] } },
      };

      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(accessSetData), { status: 200 }),
      );

      const sdk = createMockAuthSdk();

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test helper always assigns
      let auth: ReturnType<typeof useAuth> = undefined!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test helper always assigns
      let accessCtx: { accessSet: AccessSet | null; loading: boolean } = undefined!;

      AuthProvider({
        auth: sdk,
        accessControl: true,
        children: () => {
          auth = useAuth();
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
