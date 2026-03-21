import { describe, expect, it, mock } from 'bun:test';
import { err, ok } from '@vertz/fetch';
import { useContext } from '../../component/context';
import type { SdkMethodWithMeta } from '../../form/form';
import { computed, signal } from '../../runtime/signal';
import type { Signal } from '../../runtime/signal-types';
import type { AuthContextValue } from '../auth-context';
import { AuthContext } from '../auth-context';
import type {
  AuthClientError,
  AuthResponse,
  AuthStatus,
  ForgotInput,
  MfaInput,
  OAuthProviderInfo,
  ResetInput,
  SignInInput,
  SignUpInput,
} from '../auth-types';
import type { TenantContextValue } from '../tenant-context';
import { TenantContext, TenantProvider, useTenant } from '../tenant-context';

// --- Helpers ---

function createMockAuthContextValue(overrides?: Partial<AuthContextValue>): AuthContextValue {
  const userSignal = signal<{ id: string; email: string; role: string } | null>({
    id: 'user-1',
    email: 'test@example.com',
    role: 'user',
  });
  const statusSignal = signal<AuthStatus>('authenticated');
  const errorSignal = signal<AuthClientError | null>(null);

  return {
    user: userSignal as Signal<{ id: string; email: string; role: string } | null>,
    status: statusSignal as Signal<AuthStatus>,
    isAuthenticated: computed(() => statusSignal.value === 'authenticated'),
    isLoading: computed(() => statusSignal.value === 'loading'),
    error: errorSignal,
    signIn: Object.assign(
      async () => ok({ user: { id: '1', email: 'a@b.com', role: 'user' }, expiresAt: 0 }),
      { url: '/api/auth/signin', method: 'POST', meta: {} },
    ) as unknown as SdkMethodWithMeta<SignInInput, AuthResponse>,
    signUp: Object.assign(
      async () => ok({ user: { id: '1', email: 'a@b.com', role: 'user' }, expiresAt: 0 }),
      { url: '/api/auth/signup', method: 'POST', meta: {} },
    ) as unknown as SdkMethodWithMeta<SignUpInput, AuthResponse>,
    signOut: async () => {},
    refresh: async () => {},
    mfaChallenge: Object.assign(
      async () => ok({ user: { id: '1', email: 'a@b.com', role: 'user' }, expiresAt: 0 }),
      { url: '/api/auth/mfa/challenge', method: 'POST', meta: {} },
    ) as unknown as SdkMethodWithMeta<MfaInput, AuthResponse>,
    forgotPassword: Object.assign(async () => ok(undefined as void), {
      url: '/api/auth/forgot-password',
      method: 'POST',
      meta: {},
    }) as unknown as SdkMethodWithMeta<ForgotInput, void>,
    resetPassword: Object.assign(async () => ok(undefined as void), {
      url: '/api/auth/reset-password',
      method: 'POST',
      meta: {},
    }) as unknown as SdkMethodWithMeta<ResetInput, void>,
    providers: signal<OAuthProviderInfo[]>([]),
    ...overrides,
  };
}

/** Helper to create TenantProvider with default mocks and capture the context. */
function setupTenantProvider(opts: {
  listTenants?: () => PromiseLike<unknown>;
  switchTenantResult?: () => PromiseLike<unknown>;
  onSwitchComplete?: (tenantId: string) => void;
}) {
  const authValue = createMockAuthContextValue();

  const listTenants =
    (opts.listTenants as () => PromiseLike<unknown>) ??
    mock(async () =>
      ok({
        tenants: [],
        currentTenantId: undefined,
        lastTenantId: undefined,
        resolvedDefaultId: undefined,
      }),
    );

  const switchTenantSdk = Object.assign(
    opts.switchTenantResult ??
      mock(async () =>
        ok({
          tenantId: 'x',
          user: { id: '1', email: 'a@b.com', role: 'user' },
          expiresAt: 0,
        }),
      ),
    { url: '/api/auth/switch-tenant', method: 'POST', meta: {} },
  );

  // useContext returns UnwrapSignals<TenantContextValue> — signal props
  // are auto-unwrapped by wrapSignalProps in the Provider.
  let captured: Record<string, unknown> | undefined;

  AuthContext.Provider({
    value: authValue,
    children: () =>
      TenantProvider({
        listTenants: listTenants as () => PromiseLike<never>,
        switchTenant: switchTenantSdk as never,
        onSwitchComplete: opts.onSwitchComplete,
        children: () => {
          captured = useContext(TenantContext) as unknown as Record<string, unknown>;
          return null as unknown as HTMLElement;
        },
      }),
  });

  return captured!;
}

// --- Tests ---

describe('TenantContext', () => {
  describe('useTenant', () => {
    it('throws when called outside TenantProvider', () => {
      expect(() => useTenant()).toThrow('useTenant must be called within TenantProvider');
    });
  });

  describe('TenantProvider', () => {
    it('exposes tenants initialized to empty array', () => {
      const ctx = setupTenantProvider({});
      // Signal auto-unwrapped by Provider's wrapSignalProps
      expect(ctx.tenants).toEqual([]);
    });

    it('exposes currentTenantId initialized to undefined', () => {
      const ctx = setupTenantProvider({});
      expect(ctx.currentTenantId).toBeUndefined();
    });

    it('exposes isLoading initialized to true', () => {
      const ctx = setupTenantProvider({});
      expect(ctx.isLoading).toBe(true);
    });

    it('switchTenant calls SDK and updates currentTenantId', async () => {
      const switchMock = mock(async () =>
        ok({
          tenantId: 'org-1',
          user: { id: '1', email: 'a@b.com', role: 'user' },
          expiresAt: 0,
        }),
      );

      const ctx = setupTenantProvider({
        listTenants: async () =>
          ok({
            tenants: [{ id: 'org-1', name: 'Org One' }],
            currentTenantId: undefined,
            lastTenantId: undefined,
            resolvedDefaultId: 'org-1',
          }),
        switchTenantResult: switchMock,
      });

      const switchTenant = ctx.switchTenant as (tenantId: string) => Promise<{ ok: boolean }>;
      const result = await switchTenant('org-1');
      expect(result.ok).toBe(true);
      expect(ctx.currentTenantId).toBe('org-1');
      expect(switchMock).toHaveBeenCalledWith({ tenantId: 'org-1' });
    });

    it('switchTenant returns error result on failure', async () => {
      const switchMock = mock(async () =>
        err(
          Object.assign(new Error('Forbidden'), {
            code: 'AUTH_FORBIDDEN',
            statusCode: 403,
          }),
        ),
      );

      const ctx = setupTenantProvider({
        switchTenantResult: switchMock,
      });

      const switchTenant = ctx.switchTenant as (tenantId: string) => Promise<{ ok: boolean }>;
      const result = await switchTenant('org-1');
      expect(result.ok).toBe(false);
      expect(ctx.currentTenantId).toBeUndefined();
    });

    it('calls onSwitchComplete callback after successful switch', async () => {
      const onSwitchComplete = mock(() => {});
      const switchMock = mock(async () =>
        ok({
          tenantId: 'org-1',
          user: { id: '1', email: 'a@b.com', role: 'user' },
          expiresAt: 0,
        }),
      );

      const ctx = setupTenantProvider({
        switchTenantResult: switchMock,
        onSwitchComplete,
      });

      const switchTenant = ctx.switchTenant as (tenantId: string) => Promise<{ ok: boolean }>;
      await switchTenant('org-1');
      expect(onSwitchComplete).toHaveBeenCalledWith('org-1');
    });

    it('does not call onSwitchComplete on failure', async () => {
      const onSwitchComplete = mock(() => {});
      const switchMock = mock(async () =>
        err(
          Object.assign(new Error('Forbidden'), {
            code: 'AUTH_FORBIDDEN',
            statusCode: 403,
          }),
        ),
      );

      const ctx = setupTenantProvider({
        switchTenantResult: switchMock,
        onSwitchComplete,
      });

      const switchTenant = ctx.switchTenant as (tenantId: string) => Promise<{ ok: boolean }>;
      await switchTenant('org-1');
      expect(onSwitchComplete).not.toHaveBeenCalled();
    });

    it('throws when rendered outside AuthProvider', () => {
      expect(() =>
        TenantProvider({
          listTenants: async () => ok({ tenants: [], resolvedDefaultId: undefined }),
          switchTenant: Object.assign(async () => ok({}), {
            url: '/api/auth/switch-tenant',
            method: 'POST',
            meta: {},
          }) as never,
          children: () => null as unknown as HTMLElement,
        }),
      ).toThrow('TenantProvider must be rendered inside AuthProvider');
    });
  });
});
