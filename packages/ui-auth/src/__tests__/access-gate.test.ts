import { describe, expect, it } from '@vertz/test';
import { signal } from '@vertz/ui';
import type { AccessContextValue, AccessSet } from '@vertz/ui/auth';
import { AccessContext } from '@vertz/ui/auth';
import { AccessGate } from '../access-gate';
import { itWithNativeCompiler } from './native-compiler-test-utils.test';

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

    let wrapper: HTMLElement | undefined;
    AccessContext.Provider(value, () => {
      wrapper = AccessGate({
        fallback: () => 'loading...',
        children: () => 'content',
      });
    });

    expect(wrapper?.textContent).toBe('loading...');
  });

  it('renders children when loaded', () => {
    const accessSet = signal<AccessSet | null>(makeAccessSet());
    const loading = signal(false);
    const value: AccessContextValue = { accessSet, loading };

    let wrapper: HTMLElement | undefined;
    AccessContext.Provider(value, () => {
      wrapper = AccessGate({
        fallback: () => 'loading...',
        children: () => 'content',
      });
    });

    expect(wrapper?.textContent).toBe('content');
  });

  it('renders children when no provider (fail-open for UI)', () => {
    const wrapper = AccessGate({
      fallback: () => 'loading...',
      children: () => 'content',
    });

    // No provider — renders children via __child wrapper
    expect(wrapper.textContent).toBe('content');
  });

  it('renders empty when no fallback and loading', () => {
    const accessSet = signal<AccessSet | null>(null);
    const loading = signal(true);
    const value: AccessContextValue = { accessSet, loading };

    let wrapper: HTMLElement | undefined;
    AccessContext.Provider(value, () => {
      wrapper = AccessGate({
        children: () => 'content',
      });
    });

    expect(wrapper?.textContent).toBe('');
  });

  itWithNativeCompiler('transitions from fallback to children when access set loads', () => {
    const accessSet = signal<AccessSet | null>(null);
    const loading = signal(true);
    const value: AccessContextValue = { accessSet, loading };

    let wrapper: HTMLElement | undefined;
    AccessContext.Provider(value, () => {
      wrapper = AccessGate({
        fallback: () => 'loading...',
        children: () => 'content',
      });
    });

    // Initially loading — shows fallback
    expect(wrapper?.textContent).toBe('loading...');

    accessSet.value = makeAccessSet();
    loading.value = false;

    expect(wrapper?.textContent).toBe('content');
  });
});
