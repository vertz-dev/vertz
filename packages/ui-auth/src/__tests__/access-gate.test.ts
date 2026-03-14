import { describe, expect, it } from 'bun:test';
import type { ReadonlySignal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import type { AccessContextValue, AccessSet } from '@vertz/ui/auth';
import { AccessContext } from '@vertz/ui/auth';
import { AccessGate } from '../access-gate';

function makeAccessSet(): AccessSet {
  return {
    entitlements: {},
    flags: {},
    plan: null,
    computedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('AccessGate', () => {
  it('renders fallback while loading', () => {
    const accessSet = signal<AccessSet | null>(null);
    const loading = signal(true);
    const value: AccessContextValue = { accessSet, loading };

    let result: unknown;
    AccessContext.Provider(value, () => {
      result = AccessGate({
        fallback: () => 'loading...',
        children: () => 'content',
      });
    });

    expect((result as ReadonlySignal<unknown>).value).toBe('loading...');
  });

  it('renders children when loaded', () => {
    const accessSet = signal<AccessSet | null>(makeAccessSet());
    const loading = signal(false);
    const value: AccessContextValue = { accessSet, loading };

    let result: unknown;
    AccessContext.Provider(value, () => {
      result = AccessGate({
        fallback: () => 'loading...',
        children: () => 'content',
      });
    });

    expect((result as ReadonlySignal<unknown>).value).toBe('content');
  });

  it('renders children when no provider (fail-open for UI)', () => {
    const result = AccessGate({
      fallback: () => 'loading...',
      children: () => 'content',
    });

    expect(result).toBe('content');
  });

  it('renders null when no fallback and loading', () => {
    const accessSet = signal<AccessSet | null>(null);
    const loading = signal(true);
    const value: AccessContextValue = { accessSet, loading };

    let result: unknown;
    AccessContext.Provider(value, () => {
      result = AccessGate({ children: () => 'content' });
    });

    expect((result as ReadonlySignal<unknown>).value).toBeNull();
  });

  it('transitions from fallback to children when access set loads', () => {
    const accessSet = signal<AccessSet | null>(null);
    const loading = signal(true);
    const value: AccessContextValue = { accessSet, loading };

    let result: unknown;
    AccessContext.Provider(value, () => {
      result = AccessGate({
        fallback: () => 'loading...',
        children: () => 'content',
      });
    });

    const reactiveResult = result as ReadonlySignal<unknown>;
    expect(reactiveResult.value).toBe('loading...');

    accessSet.value = makeAccessSet();
    loading.value = false;

    expect(reactiveResult.value).toBe('content');
  });
});
