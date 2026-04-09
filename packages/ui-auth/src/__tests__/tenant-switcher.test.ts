import { describe, expect, it, mock } from '@vertz/test';
import { computed, signal } from '@vertz/ui';
import type {
  AuthClientError,
  AuthContextValue,
  AuthStatus,
  TenantContextValue,
  TenantInfo,
  User,
} from '@vertz/ui/auth';
import { AuthContext, TenantContext } from '@vertz/ui/auth';
import { TenantSwitcher } from '../tenant-switcher';

// --- Helpers ---

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

  return ctx;
}

function mockTenantContext(overrides?: Partial<TenantContextValue>): TenantContextValue {
  return {
    tenants: signal<TenantInfo[]>([
      { id: 'org-1', name: 'Acme Corp' },
      { id: 'org-2', name: 'Side Project' },
    ]),
    currentTenantId: signal<string | undefined>('org-1'),
    lastTenantId: signal<string | undefined>(undefined),
    resolvedDefaultId: signal<string | undefined>('org-1'),
    isLoading: signal(false),
    switchTenant: mock(async () => ({ ok: true as const, data: undefined })),
    ...overrides,
  };
}

function renderWithContext(
  tenantCtx: TenantContextValue,
  props: Record<string, unknown> = {},
): HTMLElement {
  const authCtx = mockAuthContext({ id: '1', email: 'a@b.com', role: 'user' });
  let el!: HTMLElement;

  AuthContext.Provider({
    value: authCtx,
    children: () =>
      TenantContext.Provider({
        value: tenantCtx,
        children: () => {
          el = TenantSwitcher(props as Parameters<typeof TenantSwitcher>[0]);
          return el;
        },
      }),
  });

  return el;
}

// --- Tests ---

describe('TenantSwitcher', () => {
  it('renders a container element', () => {
    const ctx = mockTenantContext();
    const el = renderWithContext(ctx);
    expect(el).toBeDefined();
    expect(el.tagName).toBeDefined();
  });

  it('displays current tenant name', () => {
    const ctx = mockTenantContext();
    const el = renderWithContext(ctx);
    const text = el.textContent ?? '';
    expect(text).toContain('Acme Corp');
  });

  it('throws when rendered outside TenantContext', () => {
    expect(() => TenantSwitcher({})).toThrow('TenantSwitcher requires TenantProvider');
  });

  it('renders a trigger button', () => {
    const ctx = mockTenantContext();
    const el = renderWithContext(ctx);
    const trigger = el.querySelector('button');
    expect(trigger).not.toBeNull();
  });

  it('shows loading state when isLoading is true', () => {
    const ctx = mockTenantContext({ isLoading: signal(true), tenants: signal([]) });
    const el = renderWithContext(ctx);
    expect(el).toBeDefined();
  });

  it('accepts className prop', () => {
    const ctx = mockTenantContext();
    const el = renderWithContext(ctx, { className: 'my-switcher' });
    expect(el.getAttribute('class')).toContain('my-switcher');
  });

  it('renders custom content via renderItem', () => {
    const ctx = mockTenantContext();
    const renderItem = (tenant: TenantInfo) => `[${tenant.id}] ${tenant.name}`;
    const el = renderWithContext(ctx, { renderItem });
    expect(el.textContent).toContain('[org-1]');
  });
});
