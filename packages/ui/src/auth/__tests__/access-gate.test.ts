import { describe, expect, it } from 'bun:test';
import { signal } from '../../runtime/signal';
import type { ReadonlySignal } from '../../runtime/signal-types';
import { AccessContext, type AccessContextValue } from '../access-context';
import { AccessGate } from '../access-gate';
import type { AccessSet } from '../access-set-types';

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

    // Result is a computed signal — read .value to get current value
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

    // No provider — renders children directly (not a signal)
    expect(result).toBe('content');
  });

  it('renders null when no fallback and loading', () => {
    const accessSet = signal<AccessSet | null>(null);
    const loading = signal(true);
    const value: AccessContextValue = { accessSet, loading };

    let result: unknown;
    AccessContext.Provider(value, () => {
      result = AccessGate({
        children: () => 'content',
      });
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
    // Initially loading — shows fallback
    expect(reactiveResult.value).toBe('loading...');

    // Access set loads — should reactively switch to children
    accessSet.value = makeAccessSet();
    loading.value = false;

    expect(reactiveResult.value).toBe('content');
  });
});
