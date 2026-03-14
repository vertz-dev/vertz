import { describe, expect, it, spyOn } from 'bun:test';
import { createContext, useContext } from '../../component/context';
import { signal } from '../../runtime/signal';
import {
  AccessContext,
  type AccessContextValue,
  can,
  canSignals,
  useAccessContext,
} from '../access-context';
import type { AccessCheckData, AccessSet } from '../access-set-types';

function makeAccessSet(
  entitlements: Record<string, AccessCheckData>,
  overrides?: Partial<AccessSet>,
): AccessSet {
  return {
    entitlements,
    flags: {},
    plan: null,
    computedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function withProvider(value: AccessContextValue, fn: () => void): void {
  AccessContext.Provider(value, fn);
}

describe('AccessContext', () => {
  it('has stable ID @vertz/ui::AccessContext', () => {
    // The stable ID is set in createContext call — verify by creating
    // another context with the same ID and checking identity
    const duplicate = createContext<AccessContextValue>(undefined, '@vertz/ui::AccessContext');
    expect(duplicate).toBe(AccessContext);
  });

  it('useAccessContext returns context value when provider present', () => {
    const value: AccessContextValue = {
      accessSet: signal<AccessSet | null>(null),
      loading: signal(true),
    };

    let result: ReturnType<typeof useAccessContext>;
    withProvider(value, () => {
      result = useAccessContext();
    });

    expect(result!).toBeDefined();
  });

  it('useAccessContext throws when no provider', () => {
    expect(() => useAccessContext()).toThrow(
      'useAccessContext must be called within AccessContext.Provider',
    );
  });
});

describe('can()', () => {
  it('returns allowed:true for entitled user', () => {
    const accessSet = signal<AccessSet | null>(
      makeAccessSet({
        'project:view': { allowed: true, reasons: [] },
      }),
    );
    const loading = signal(false);

    let result: ReturnType<typeof can>;
    withProvider({ accessSet, loading }, () => {
      result = can('project:view');
    });

    expect(result!.allowed.value).toBe(true);
    expect(result!.loading.value).toBe(false);
  });

  it('returns denied with reason for unentitled user', () => {
    const accessSet = signal<AccessSet | null>(
      makeAccessSet({
        'project:delete': {
          allowed: false,
          reasons: ['role_required'],
          reason: 'role_required',
          meta: { requiredRoles: ['admin'] },
        },
      }),
    );
    const loading = signal(false);

    let result: ReturnType<typeof can>;
    withProvider({ accessSet, loading }, () => {
      result = can('project:delete');
    });

    expect(result!.allowed.value).toBe(false);
    expect(result!.reasons.value).toContain('role_required');
    expect(result!.reason.value).toBe('role_required');
    expect(result!.meta.value).toEqual({ requiredRoles: ['admin'] });
  });

  it('returns not_authenticated fallback when no provider', () => {
    const result = can('project:view');

    // Fallback is now signal-backed (consistent with provider path)
    expect(result.allowed.value).toBe(false);
    expect(result.reasons.value).toContain('not_authenticated');
    expect(result.loading.value).toBe(false);
  });

  it('warns in dev when no provider', () => {
    const consoleSpy = spyOn(console, 'warn').mockImplementation(() => {});

    can('project:view');

    expect(consoleSpy).toHaveBeenCalledWith(
      'can() called without AccessContext.Provider — all checks denied',
    );
    consoleSpy.mockRestore();
  });

  it('returns loading:true when access set is null', () => {
    const accessSet = signal<AccessSet | null>(null);
    const loading = signal(true);

    let result: ReturnType<typeof can>;
    withProvider({ accessSet, loading }, () => {
      result = can('project:view');
    });

    expect(result!.loading.value).toBe(true);
    expect(result!.allowed.value).toBe(false);
  });

  it('uses entity.__access when present', () => {
    const accessSet = signal<AccessSet | null>(
      makeAccessSet({
        'project:edit': { allowed: false, reasons: ['role_required'] },
      }),
    );
    const loading = signal(false);

    const entity = {
      __access: {
        'project:edit': { allowed: true, reasons: [] as string[] },
      },
    };

    let result: ReturnType<typeof can>;
    withProvider({ accessSet, loading }, () => {
      result = can('project:edit', entity as { __access: Record<string, AccessCheckData> });
    });

    // Entity-level check says allowed, even though global says denied
    expect(result!.allowed.value).toBe(true);
  });

  it('falls back to global when entity has no __access', () => {
    const accessSet = signal<AccessSet | null>(
      makeAccessSet({
        'project:edit': { allowed: true, reasons: [] },
      }),
    );
    const loading = signal(false);

    let result: ReturnType<typeof can>;
    withProvider({ accessSet, loading }, () => {
      result = can('project:edit', {});
    });

    expect(result!.allowed.value).toBe(true);
  });

  it('returns meta.limit when access set entitlement has limit data (allowed)', () => {
    const accessSet = signal<AccessSet | null>(
      makeAccessSet({
        'project:create': {
          allowed: true,
          reasons: [],
          meta: { limit: { max: 10, consumed: 3, remaining: 7 } },
        },
      }),
    );
    const loading = signal(false);

    let result: ReturnType<typeof can>;
    withProvider({ accessSet, loading }, () => {
      result = can('project:create');
    });

    expect(result!.allowed.value).toBe(true);
    expect(result!.meta.value?.limit).toEqual({ max: 10, consumed: 3, remaining: 7 });
    expect(result!.meta.value?.limit?.remaining).toBe(7);
  });

  it('returns meta.limit with remaining:0 when limit_reached (denied)', () => {
    const accessSet = signal<AccessSet | null>(
      makeAccessSet({
        'project:create': {
          allowed: false,
          reasons: ['limit_reached'],
          reason: 'limit_reached',
          meta: { limit: { max: 10, consumed: 10, remaining: 0 } },
        },
      }),
    );
    const loading = signal(false);

    let result: ReturnType<typeof can>;
    withProvider({ accessSet, loading }, () => {
      result = can('project:create');
    });

    expect(result!.allowed.value).toBe(false);
    expect(result!.reasons.value).toContain('limit_reached');
    expect(result!.meta.value?.limit).toEqual({ max: 10, consumed: 10, remaining: 0 });
    expect(result!.meta.value?.limit?.remaining).toBe(0);
  });

  it('updates reactively when access set signal changes', () => {
    const accessSet = signal<AccessSet | null>(
      makeAccessSet({
        'project:edit': { allowed: false, reasons: ['role_required'] },
      }),
    );
    const loading = signal(false);

    let result: ReturnType<typeof can>;
    withProvider({ accessSet, loading }, () => {
      result = can('project:edit');
    });

    expect(result!.allowed.value).toBe(false);

    // Update the access set
    accessSet.value = makeAccessSet({
      'project:edit': { allowed: true, reasons: [] },
    });

    expect(result!.allowed.value).toBe(true);
  });
});

describe('canSignals()', () => {
  it('returns RawAccessCheck with all ReadonlySignal properties', () => {
    const accessSet = signal<AccessSet | null>(
      makeAccessSet({
        'project:view': {
          allowed: true,
          reasons: [],
          reason: undefined,
          meta: { limit: { max: 10, consumed: 3, remaining: 7 } },
        },
      }),
    );
    const loading = signal(false);

    let result: ReturnType<typeof canSignals>;
    withProvider({ accessSet, loading }, () => {
      result = canSignals('project:view');
    });

    // All properties are ReadonlySignal — access .value directly
    expect(result!.allowed.value).toBe(true);
    expect(result!.loading.value).toBe(false);
    expect(result!.reasons.value).toEqual([]);
    expect(result!.reason.value).toBeUndefined();
    expect(result!.meta.value?.limit?.remaining).toBe(7);
  });

  it('returns fail-secure fallback when no provider', () => {
    const result = canSignals('project:view');

    expect(result.allowed.value).toBe(false);
    expect(result.reasons.value).toContain('not_authenticated');
    expect(result.reason.value).toBe('not_authenticated');
    expect(result.meta.value).toBeUndefined();
    expect(result.loading.value).toBe(false);
  });

  it('warns in dev when no provider', () => {
    const consoleSpy = spyOn(console, 'warn').mockImplementation(() => {});

    canSignals('project:view');

    expect(consoleSpy).toHaveBeenCalledWith(
      'canSignals() called without AccessContext.Provider — all checks denied',
    );
    consoleSpy.mockRestore();
  });

  it('uses entity.__access when present', () => {
    const accessSet = signal<AccessSet | null>(
      makeAccessSet({
        'project:edit': { allowed: false, reasons: ['role_required'] },
      }),
    );
    const loading = signal(false);

    const entity = {
      __access: {
        'project:edit': { allowed: true, reasons: [] as string[] },
      },
    };

    let result: ReturnType<typeof canSignals>;
    withProvider({ accessSet, loading }, () => {
      result = canSignals('project:edit', entity as { __access: Record<string, AccessCheckData> });
    });

    // Entity-level check says allowed, even though global says denied
    expect(result!.allowed.value).toBe(true);
  });

  it('returns same reactive behavior as can()', () => {
    const accessSet = signal<AccessSet | null>(
      makeAccessSet({
        'project:edit': { allowed: false, reasons: ['role_required'] },
      }),
    );
    const loading = signal(false);

    let result: ReturnType<typeof canSignals>;
    withProvider({ accessSet, loading }, () => {
      result = canSignals('project:edit');
    });

    expect(result!.allowed.value).toBe(false);

    // Update reactively
    accessSet.value = makeAccessSet({
      'project:edit': { allowed: true, reasons: [] },
    });

    expect(result!.allowed.value).toBe(true);
  });
});
