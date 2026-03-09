import type { Result } from '@vertz/fetch';
import { type Context, createContext, type UnwrapSignals, useContext } from '../component/context';
import type { SdkMethodWithMeta } from '../form/form';
import { _tryOnCleanup } from '../runtime/disposal';
import { computed, signal } from '../runtime/signal';
import type { ReadonlySignal, Signal } from '../runtime/signal-types';
import { AccessContext } from './access-context';
import { createAccessEventClient } from './access-event-client';
import { handleAccessEvent } from './access-event-handler';
import type { AccessSet } from './access-set-types';
import { createAuthMethod } from './auth-client';
import type {
  AuthClientError,
  AuthResponse,
  AuthStatus,
  ForgotInput,
  MfaInput,
  ResetInput,
  SignInInput,
  SignUpInput,
  User,
} from './auth-types';
import {
  forgotPasswordSchema,
  mfaSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from './auth-types';
import { createTokenRefresh } from './token-refresh';

declare global {
  interface Window {
    __VERTZ_SESSION__?: { user: User; expiresAt: number };
  }
}

// --- Context value type ---

export interface AuthContextValue {
  user: Signal<User | null>;
  status: Signal<AuthStatus>;
  isAuthenticated: ReadonlySignal<boolean>;
  isLoading: ReadonlySignal<boolean>;
  error: Signal<AuthClientError | null>;
  signIn: SdkMethodWithMeta<SignInInput, AuthResponse>;
  signUp: SdkMethodWithMeta<SignUpInput, AuthResponse>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  mfaChallenge: SdkMethodWithMeta<MfaInput, AuthResponse>;
  forgotPassword: SdkMethodWithMeta<ForgotInput, void>;
  resetPassword: SdkMethodWithMeta<ResetInput, void>;
}

// --- Context with HMR-stable ID ---

export const AuthContext: Context<AuthContextValue> = createContext<AuthContextValue>(
  undefined,
  '@vertz/ui::AuthContext',
);

// --- useAuth hook ---

export function useAuth(): UnwrapSignals<AuthContextValue> {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be called within AuthProvider');
  return ctx;
}

// --- AuthProvider props ---

export interface AuthProviderProps {
  basePath?: string;
  accessControl?: boolean;
  /** Enable WebSocket-based real-time access event updates. Requires accessControl. */
  accessEvents?: boolean;
  /** WebSocket URL for access events. Defaults to deriving from window.location. */
  accessEventsUrl?: string;
  /** Map of entitlement names to their required flags. Used for inline flag toggle updates. */
  flagEntitlementMap?: Record<string, string[]>;
  children: (() => unknown) | unknown;
}

// --- AuthProvider component ---

export function AuthProvider({
  basePath = '/api/auth',
  accessControl,
  accessEvents,
  accessEventsUrl,
  flagEntitlementMap,
  children,
}: AuthProviderProps): HTMLElement {
  const userSignal = signal<User | null>(null);
  const statusSignal = signal<AuthStatus>('idle');
  const errorSignal = signal<AuthClientError | null>(null);

  const isAuthenticated = computed(() => statusSignal.value === 'authenticated');
  const isLoading = computed(() => statusSignal.value === 'loading');

  // Access control signals (created when accessControl is enabled)
  const accessSetSignal = accessControl ? signal<AccessSet | null>(null) : null;
  const accessLoadingSignal = accessControl ? signal(true) : null;

  // Token refresh controller
  const tokenRefresh = createTokenRefresh({
    onRefresh: async () => {
      await refresh();
    },
  });

  async function fetchAccessSet() {
    if (!accessSetSignal || !accessLoadingSignal) return;
    try {
      const res = await fetch(`${basePath}/access-set`, {
        headers: { 'X-VTZ-Request': '1' },
        credentials: 'include',
      });
      if (res.ok) {
        accessSetSignal.value = (await res.json()) as AccessSet;
        accessLoadingSignal.value = false;
      }
    } catch {
      // Access set fetch failure is non-fatal
    }
  }

  function clearAccessSet() {
    if (!accessSetSignal || !accessLoadingSignal) return;
    accessSetSignal.value = null;
    accessLoadingSignal.value = true;
  }

  function handleAuthSuccess(data: AuthResponse) {
    userSignal.value = data.user;
    statusSignal.value = 'authenticated';
    errorSignal.value = null;
    // Schedule proactive token refresh
    if (data.expiresAt) {
      tokenRefresh.schedule(data.expiresAt);
    }
    // Refresh access set when accessControl is enabled
    void fetchAccessSet();
  }

  function handleAuthError(error: Error & Partial<AuthClientError>) {
    if (error.code === 'MFA_REQUIRED') {
      statusSignal.value = 'mfa_required';
      errorSignal.value = null;
    } else {
      statusSignal.value = 'error';
      errorSignal.value = {
        code: error.code ?? 'SERVER_ERROR',
        message: error.message,
        statusCode: error.statusCode ?? 0,
        retryAfter: error.retryAfter,
      };
    }
  }

  const signInMethod = createAuthMethod<SignInInput, AuthResponse>({
    basePath,
    endpoint: 'signin',
    httpMethod: 'POST',
    schema: signInSchema,
    onSuccess: handleAuthSuccess,
  });

  const signIn = Object.assign(
    async (body: SignInInput): Promise<Result<AuthResponse, Error>> => {
      statusSignal.value = 'loading';
      errorSignal.value = null;
      const result = await signInMethod(body);
      if (!result.ok) {
        handleAuthError(result.error as Error & Partial<AuthClientError>);
      }
      return result;
    },
    {
      url: signInMethod.url,
      method: signInMethod.method,
      meta: signInMethod.meta,
    },
  ) as SdkMethodWithMeta<SignInInput, AuthResponse>;

  const signUpMethod = createAuthMethod<SignUpInput, AuthResponse>({
    basePath,
    endpoint: 'signup',
    httpMethod: 'POST',
    schema: signUpSchema,
    onSuccess: handleAuthSuccess,
  });

  const signUp = Object.assign(
    async (body: SignUpInput): Promise<Result<AuthResponse, Error>> => {
      statusSignal.value = 'loading';
      errorSignal.value = null;
      const result = await signUpMethod(body);
      if (!result.ok) {
        handleAuthError(result.error as Error & Partial<AuthClientError>);
      }
      return result;
    },
    {
      url: signUpMethod.url,
      method: signUpMethod.method,
      meta: signUpMethod.meta,
    },
  ) as SdkMethodWithMeta<SignUpInput, AuthResponse>;

  // MFA challenge — transitions to authenticated on success
  const mfaChallengeMethod = createAuthMethod<MfaInput, AuthResponse>({
    basePath,
    endpoint: 'mfa/challenge',
    httpMethod: 'POST',
    schema: mfaSchema,
    onSuccess: handleAuthSuccess,
  });

  const mfaChallenge = Object.assign(
    async (body: MfaInput): Promise<Result<AuthResponse, Error>> => {
      statusSignal.value = 'loading';
      errorSignal.value = null;
      const result = await mfaChallengeMethod(body);
      if (!result.ok) {
        handleAuthError(result.error as Error & Partial<AuthClientError>);
      }
      return result;
    },
    {
      url: mfaChallengeMethod.url,
      method: mfaChallengeMethod.method,
      meta: mfaChallengeMethod.meta,
    },
  ) as SdkMethodWithMeta<MfaInput, AuthResponse>;

  // Forgot password — no state transition (always returns 200)
  const forgotPasswordMethod = createAuthMethod<ForgotInput, void>({
    basePath,
    endpoint: 'forgot-password',
    httpMethod: 'POST',
    schema: forgotPasswordSchema,
    onSuccess: () => {},
  });

  const forgotPassword = Object.assign(
    async (body: ForgotInput): Promise<Result<void, Error>> => {
      return forgotPasswordMethod(body);
    },
    {
      url: forgotPasswordMethod.url,
      method: forgotPasswordMethod.method,
      meta: forgotPasswordMethod.meta,
    },
  ) as SdkMethodWithMeta<ForgotInput, void>;

  // Reset password — no state transition
  const resetPasswordMethod = createAuthMethod<ResetInput, void>({
    basePath,
    endpoint: 'reset-password',
    httpMethod: 'POST',
    schema: resetPasswordSchema,
    onSuccess: () => {},
  });

  const resetPassword = Object.assign(
    async (body: ResetInput): Promise<Result<void, Error>> => {
      return resetPasswordMethod(body);
    },
    {
      url: resetPasswordMethod.url,
      method: resetPasswordMethod.method,
      meta: resetPasswordMethod.meta,
    },
  ) as SdkMethodWithMeta<ResetInput, void>;

  const signOut = async () => {
    tokenRefresh.cancel();
    try {
      await fetch(`${basePath}/signout`, {
        method: 'POST',
        headers: { 'X-VTZ-Request': '1' },
        credentials: 'include',
      });
    } catch {
      // signOut should not fail — even if the network call fails, clear local state
    }
    userSignal.value = null;
    statusSignal.value = 'unauthenticated';
    errorSignal.value = null;
    clearAccessSet();
    if (typeof window !== 'undefined') {
      delete window.__VERTZ_SESSION__;
    }
  };

  let refreshInFlight: Promise<void> | null = null;

  const doRefresh = async () => {
    statusSignal.value = 'loading';
    try {
      const res = await fetch(`${basePath}/refresh`, {
        method: 'POST',
        headers: { 'X-VTZ-Request': '1' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = (await res.json()) as AuthResponse;
        handleAuthSuccess(data);
      } else {
        userSignal.value = null;
        statusSignal.value = 'unauthenticated';
        errorSignal.value = null;
      }
    } catch {
      userSignal.value = null;
      statusSignal.value = 'unauthenticated';
      errorSignal.value = null;
    }
  };

  const refresh = async () => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  };

  // Access event client (WebSocket for real-time access invalidation)
  const eventClient =
    accessControl && accessEvents && accessSetSignal
      ? createAccessEventClient({
          url: accessEventsUrl,
          onEvent: (event) => {
            if (!accessSetSignal) return;

            if (event.type === 'access:flag_toggled' || event.type === 'access:limit_updated') {
              // Inline update — modify accessSet signal directly
              handleAccessEvent(accessSetSignal, event, flagEntitlementMap);
            } else {
              // role_changed / plan_changed — jittered refetch
              const jitter = Math.random() * 1000;
              setTimeout(() => {
                void fetchAccessSet();
              }, jitter);
            }
          },
          onReconnect: () => {
            // Immediate refetch on reconnection
            void fetchAccessSet();
          },
        })
      : null;

  // Auto-connect event client when authenticated
  if (eventClient) {
    eventClient.connect();
  }

  // Register disposal for timer cleanup
  _tryOnCleanup(() => {
    tokenRefresh.dispose();
    eventClient?.dispose();
  });

  const contextValue: AuthContextValue = {
    user: userSignal,
    status: statusSignal,
    isAuthenticated,
    isLoading,
    error: errorSignal,
    signIn,
    signUp,
    signOut,
    refresh,
    mfaChallenge,
    forgotPassword,
    resetPassword,
  };

  // SSR hydration
  if (typeof window !== 'undefined') {
    if (window.__VERTZ_SESSION__?.user) {
      const session = window.__VERTZ_SESSION__;
      userSignal.value = session.user;
      statusSignal.value = 'authenticated';
      // Schedule refresh from hydrated expiresAt
      if (session.expiresAt) {
        tokenRefresh.schedule(session.expiresAt);
      }
    } else {
      // No session found — resolve to unauthenticated immediately
      statusSignal.value = 'unauthenticated';
    }
  }

  // Wrap in AccessContext.Provider when accessControl is enabled
  if (accessControl && accessSetSignal && accessLoadingSignal) {
    // Hydrate from SSR-injected global
    if (
      typeof window !== 'undefined' &&
      window.__VERTZ_ACCESS_SET__ &&
      typeof window.__VERTZ_ACCESS_SET__.entitlements === 'object' &&
      window.__VERTZ_ACCESS_SET__.entitlements !== null
    ) {
      accessSetSignal.value = window.__VERTZ_ACCESS_SET__;
      accessLoadingSignal.value = false;
    }

    const accessValue = { accessSet: accessSetSignal, loading: accessLoadingSignal };

    return AuthContext.Provider({
      value: contextValue,
      children: () =>
        AccessContext.Provider({
          value: accessValue,
          children,
        }),
    });
  }

  return AuthContext.Provider({ value: contextValue, children });
}
