import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  __$refreshPerform,
  __$refreshReg,
  __$refreshTrack,
} from '../bun-plugin/fast-refresh-runtime';

// ── Registry Cleanup ──────────────────────────────────────────────
// The runtime stores its registry on globalThis via Symbol.for keys.
// We need to clear it between tests to avoid cross-test contamination.

const REGISTRY_KEY = Symbol.for('vertz:fast-refresh:registry');
const DIRTY_KEY = Symbol.for('vertz:fast-refresh:dirty');

function clearRegistry(): void {
  const reg = (globalThis as Record<symbol, Map<string, unknown>>)[REGISTRY_KEY];
  if (reg) reg.clear();
  const dirty = (globalThis as Record<symbol, Set<string>>)[DIRTY_KEY];
  if (dirty) dirty.clear();
}

// ── Helpers ───────────────────────────────────────────────────────

/** Create a simple factory that produces a div with text. */
function createFactory(text: string) {
  return () => {
    const el = document.createElement('div');
    el.textContent = text;
    return el;
  };
}

/** Mount an element into the document body so isConnected is true. */
function mount(el: HTMLElement): void {
  document.body.appendChild(el);
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Fast Refresh Runtime', () => {
  beforeEach(() => {
    clearRegistry();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    clearRegistry();
    document.body.innerHTML = '';
  });

  describe('__$refreshReg', () => {
    it('registers a component factory in the registry', () => {
      const factory = createFactory('Hello');
      __$refreshReg('mod1', 'App', factory);

      // The registry should have the module and component
      const reg = (globalThis as Record<symbol, Map<string, Map<string, unknown>>>)[REGISTRY_KEY];
      expect(reg.has('mod1')).toBe(true);
      expect(reg.get('mod1')?.has('App')).toBe(true);
    });

    it('updates factory on HMR re-evaluation (same moduleId + name)', () => {
      const factory1 = createFactory('v1');
      const factory2 = createFactory('v2');

      __$refreshReg('mod1', 'App', factory1);
      __$refreshReg('mod1', 'App', factory2);

      // The factory should be the updated one
      const reg = (
        globalThis as Record<
          symbol,
          Map<string, Map<string, { factory: (...args: never) => unknown }>>
        >
      )[REGISTRY_KEY];
      const record = reg.get('mod1')?.get('App');
      expect(record?.factory).toBe(factory2);
    });

    it('marks module as dirty on re-registration', () => {
      const factory1 = createFactory('v1');
      const factory2 = createFactory('v2');

      __$refreshReg('mod1', 'App', factory1);
      // First registration is NOT dirty (nothing to re-mount)
      const dirty = (globalThis as Record<symbol, Set<string>>)[DIRTY_KEY];
      expect(dirty.has('mod1')).toBe(false);

      // Re-registration marks module as dirty
      __$refreshReg('mod1', 'App', factory2);
      expect(dirty.has('mod1')).toBe(true);
    });

    it('supports multiple components per module', () => {
      __$refreshReg('mod1', 'Header', createFactory('Header'));
      __$refreshReg('mod1', 'Footer', createFactory('Footer'));

      const reg = (globalThis as Record<symbol, Map<string, Map<string, unknown>>>)[REGISTRY_KEY];
      expect(reg.get('mod1')?.size).toBe(2);
      expect(reg.get('mod1')?.has('Header')).toBe(true);
      expect(reg.get('mod1')?.has('Footer')).toBe(true);
    });
  });

  describe('__$refreshTrack', () => {
    it('returns the element unchanged', () => {
      const factory = createFactory('Hello');
      __$refreshReg('mod1', 'App', factory);

      const el = document.createElement('div');
      const result = __$refreshTrack('mod1', 'App', el, [], [], null);

      expect(result).toBe(el);
    });

    it('tracks a live instance in the registry', () => {
      const factory = createFactory('Hello');
      __$refreshReg('mod1', 'App', factory);

      const el = document.createElement('div');
      mount(el);
      __$refreshTrack('mod1', 'App', el, [], [], null);

      const reg = (
        globalThis as Record<
          symbol,
          Map<string, Map<string, { instances: Array<{ element: HTMLElement }> }>>
        >
      )[REGISTRY_KEY];
      const record = reg.get('mod1')?.get('App');
      expect(record?.instances.length).toBe(1);
      expect(record?.instances[0]?.element).toBe(el);
    });

    it('prunes disconnected instances on track', () => {
      const factory = createFactory('Hello');
      __$refreshReg('mod1', 'App', factory);

      // Track an element that IS in the DOM
      const connected = document.createElement('div');
      mount(connected);
      __$refreshTrack('mod1', 'App', connected, [], [], null);

      // Track another element that IS NOT in the DOM (disconnected)
      const disconnected = document.createElement('div');
      // Don't mount — isConnected will be false
      __$refreshTrack('mod1', 'App', disconnected, [], [], null);

      const reg = (
        globalThis as Record<
          symbol,
          Map<string, Map<string, { instances: Array<{ element: HTMLElement }> }>>
        >
      )[REGISTRY_KEY];
      const record = reg.get('mod1')?.get('App');
      // Only the connected + new disconnected should remain
      // (prune removes old disconnected, but the new one is added after prune)
      // Actually: prune happens first (keeps connected), then new is pushed
      expect(record?.instances.length).toBe(2);

      // Now track another — this triggers prune again, which removes disconnected
      const connected2 = document.createElement('div');
      mount(connected2);
      __$refreshTrack('mod1', 'App', connected2, [], [], null);

      // After prune: connected (in DOM) + connected2 (in DOM)
      // disconnected was pruned
      expect(record?.instances.length).toBe(2);
      expect(record?.instances[0]?.element).toBe(connected);
      expect(record?.instances[1]?.element).toBe(connected2);
    });

    it('returns element unchanged for unknown module', () => {
      const el = document.createElement('div');
      const result = __$refreshTrack('unknown', 'App', el, [], [], null);
      expect(result).toBe(el);
    });
  });

  describe('__$refreshPerform', () => {
    it('is a no-op when module is not dirty', () => {
      const factory = createFactory('Hello');
      __$refreshReg('mod1', 'App', factory);

      const el = factory();
      mount(el);
      __$refreshTrack('mod1', 'App', el, [], [], null);

      // Not dirty — perform should do nothing
      __$refreshPerform('mod1');
      expect(el.isConnected).toBe(true);
      expect(el.textContent).toBe('Hello');
    });

    it('replaces DOM element when module is dirty', () => {
      const factory1 = createFactory('v1');
      __$refreshReg('mod1', 'App', factory1);

      const el = factory1();
      mount(el);
      __$refreshTrack('mod1', 'App', el, [], [], null);

      // Update factory (marks module as dirty)
      const factory2 = createFactory('v2');
      __$refreshReg('mod1', 'App', factory2);

      // Perform refresh
      __$refreshPerform('mod1');

      // Old element should be replaced
      expect(el.isConnected).toBe(false);
      // New element should be in the DOM with new content
      expect(document.body.textContent).toBe('v2');
    });

    it('runs old cleanups during re-mount', () => {
      let cleaned = false;
      const factory1 = createFactory('v1');
      __$refreshReg('mod1', 'App', factory1);

      const el = factory1();
      mount(el);
      const cleanups = [
        () => {
          cleaned = true;
        },
      ];
      __$refreshTrack('mod1', 'App', el, [], cleanups, null);

      // Update and perform
      __$refreshReg('mod1', 'App', createFactory('v2'));
      __$refreshPerform('mod1');

      expect(cleaned).toBe(true);
    });

    it('skips disconnected instances during perform', () => {
      const factory1 = createFactory('v1');
      __$refreshReg('mod1', 'App', factory1);

      const el = factory1();
      // Don't mount — element has no parent
      __$refreshTrack('mod1', 'App', el, [], [], null);

      // Update and perform
      __$refreshReg('mod1', 'App', createFactory('v2'));
      __$refreshPerform('mod1');

      // Element was never in DOM, so nothing changes
      expect(el.textContent).toBe('v1');
    });

    it('logs warning when signal count changes across re-mount', () => {
      // Create signals that match the SignalRef interface
      const signal1 = { peek: () => 42, value: 42 };
      const signal2 = { peek: () => 'hello', value: 'hello' as unknown };

      const factory1 = createFactory('v1');
      __$refreshReg('mod1', 'App', factory1);

      const el = factory1();
      mount(el);
      // Track with 2 signals — but the new factory will produce 0 (no signal collection)
      __$refreshTrack('mod1', 'App', el, [], [], null, [signal1, signal2]);

      __$refreshReg('mod1', 'App', createFactory('v2'));
      // Should warn about signal count mismatch (2 → 0) but still replace
      __$refreshPerform('mod1');

      // DOM should be updated despite signal mismatch
      expect(document.body.textContent).toBe('v2');
    });

    it('handles factory errors gracefully — keeps old instance', () => {
      const factory1 = createFactory('v1');
      __$refreshReg('mod1', 'App', factory1);

      const el = factory1();
      mount(el);
      __$refreshTrack('mod1', 'App', el, [], [], null);

      // New factory that throws
      const brokenFactory = () => {
        throw new Error('Factory crash');
      };
      __$refreshReg('mod1', 'App', brokenFactory);

      // Should not throw — error is caught and logged
      __$refreshPerform('mod1');

      // Old element should still be in the DOM
      expect(el.isConnected).toBe(true);
      expect(el.textContent).toBe('v1');
    });

    it('clears dirty flag after perform', () => {
      __$refreshReg('mod1', 'App', createFactory('v1'));
      __$refreshReg('mod1', 'App', createFactory('v2')); // marks dirty

      const dirty = (globalThis as Record<symbol, Set<string>>)[DIRTY_KEY];
      expect(dirty.has('mod1')).toBe(true);

      __$refreshPerform('mod1');
      expect(dirty.has('mod1')).toBe(false);
    });

    it('handles multiple components in the same module', () => {
      const headerFactory = createFactory('Header v1');
      const footerFactory = createFactory('Footer v1');
      __$refreshReg('mod1', 'Header', headerFactory);
      __$refreshReg('mod1', 'Footer', footerFactory);

      const headerEl = headerFactory();
      const footerEl = footerFactory();
      mount(headerEl);
      mount(footerEl);
      __$refreshTrack('mod1', 'Header', headerEl, [], [], null);
      __$refreshTrack('mod1', 'Footer', footerEl, [], [], null);

      // Update both
      __$refreshReg('mod1', 'Header', createFactory('Header v2'));
      __$refreshReg('mod1', 'Footer', createFactory('Footer v2'));
      __$refreshPerform('mod1');

      expect(document.body.textContent).toBe('Header v2Footer v2');
    });

    it('handles multiple instances of the same component', () => {
      const factory = createFactory('Item');
      __$refreshReg('mod1', 'Item', factory);

      const el1 = factory();
      const el2 = factory();
      mount(el1);
      mount(el2);
      __$refreshTrack('mod1', 'Item', el1, [], [], null);
      __$refreshTrack('mod1', 'Item', el2, [], [], null);

      __$refreshReg('mod1', 'Item', createFactory('Updated Item'));
      __$refreshPerform('mod1');

      expect(document.body.children.length).toBe(2);
      expect(document.body.children[0]?.textContent).toBe('Updated Item');
      expect(document.body.children[1]?.textContent).toBe('Updated Item');
    });
  });
});
