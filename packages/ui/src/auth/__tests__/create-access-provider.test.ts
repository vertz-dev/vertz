import { afterEach, describe, expect, it } from 'bun:test';
import type { AccessSet } from '../access-set-types';
import { createAccessProvider } from '../create-access-provider';

const testAccessSet: AccessSet = {
  entitlements: {
    'project:view': { allowed: true, reasons: [] },
  },
  flags: {},
  plan: 'pro',
  computedAt: '2026-01-01T00:00:00.000Z',
};

describe('createAccessProvider', () => {
  afterEach(() => {
    // Clean up global
    if (typeof window !== 'undefined') {
      delete (window as Record<string, unknown>).__VERTZ_ACCESS_SET__;
    }
  });

  it('reads from window.__VERTZ_ACCESS_SET__', () => {
    (globalThis as Record<string, unknown>).window ??= globalThis;
    (window as Record<string, unknown>).__VERTZ_ACCESS_SET__ = testAccessSet;

    const { accessSet } = createAccessProvider();

    expect(accessSet.value).toEqual(testAccessSet);
  });

  it('sets loading=false when data present', () => {
    (globalThis as Record<string, unknown>).window ??= globalThis;
    (window as Record<string, unknown>).__VERTZ_ACCESS_SET__ = testAccessSet;

    const { loading } = createAccessProvider();

    expect(loading.value).toBe(false);
  });

  it('sets loading=true when no data', () => {
    const { loading } = createAccessProvider();

    expect(loading.value).toBe(true);
  });

  it('returns null accessSet when no window data', () => {
    const { accessSet } = createAccessProvider();

    expect(accessSet.value).toBeNull();
  });

  it('ignores __VERTZ_ACCESS_SET__ with invalid shape', () => {
    (globalThis as Record<string, unknown>).window ??= globalThis;
    // Set malformed data — entitlements is null instead of object
    (window as Record<string, unknown>).__VERTZ_ACCESS_SET__ = { entitlements: null };

    const { accessSet, loading } = createAccessProvider();

    // Should NOT hydrate from malformed data
    expect(accessSet.value).toBeNull();
    expect(loading.value).toBe(true);
  });
});
