import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

beforeAll(() => {
  GlobalRegistrator.register({ url: 'http://localhost/' });
});
afterAll(() => {
  GlobalRegistrator.unregister();
});

import { signal } from '@vertz/ui';
import { startSignalCollection, stopSignalCollection } from '@vertz/ui/internals';
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

/** Signal ref used for state preservation in tests. */
interface SignalRef {
  peek(): unknown;
  value: unknown;
}

/** Create a simple factory that produces a div with text. */
function createFactory(text: string) {
  return () => {
    const el = document.createElement('div');
    el.textContent = text;
    return el;
  };
}

/**
 * Wrap a factory with the same signal collection + tracking pattern
 * that the Fast Refresh codegen generates. This simulates:
 *   __$startSigCol(); const el = orig(); const sigs = __$stopSigCol();
 *   return __$refreshTrack(moduleId, name, el, args, scope, ctx, sigs);
 */
function wrapFactory(
  moduleId: string,
  name: string,
  factory: () => HTMLElement,
): () => HTMLElement {
  return () => {
    startSignalCollection();
    const el = factory();
    const sigs = stopSignalCollection() as SignalRef[];
    return __$refreshTrack(moduleId, name, el, [], [], null, sigs);
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

    it('keeps disconnected instances on track (pruning deferred to perform)', () => {
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
      // Both should be tracked — no eager pruning in __$refreshTrack.
      // Disconnected instances are pruned lazily in __$refreshPerform.
      expect(record?.instances.length).toBe(2);
      expect(record?.instances[0]?.element).toBe(connected);
      expect(record?.instances[1]?.element).toBe(disconnected);
    });

    it('tracks all instances created in a batch before DOM append (like __list)', () => {
      // Simulates __list behavior: renderFn creates elements via component wrappers
      // which call __$refreshTrack, THEN __list appends them to the DOM.
      // All instances must survive tracking even though they're not connected yet.
      const factory = createFactory('Item');
      __$refreshReg('mod1', 'Item', factory);

      // Create 3 elements WITHOUT mounting (simulating __list batch creation)
      const el1 = document.createElement('div');
      const el2 = document.createElement('div');
      const el3 = document.createElement('div');

      // Track all 3 before any are in the DOM
      __$refreshTrack('mod1', 'Item', el1, [{ id: '1' }], [], null);
      __$refreshTrack('mod1', 'Item', el2, [{ id: '2' }], [], null);
      __$refreshTrack('mod1', 'Item', el3, [{ id: '3' }], [], null);

      // Now append to DOM (like __list reconciliation does)
      const container = document.createElement('div');
      document.body.appendChild(container);
      container.appendChild(el1);
      container.appendChild(el2);
      container.appendChild(el3);

      const reg = (
        globalThis as Record<
          symbol,
          Map<string, Map<string, { instances: Array<{ element: HTMLElement }> }>>
        >
      )[REGISTRY_KEY];
      const record = reg.get('mod1')?.get('Item');

      // ALL 3 instances must be tracked
      expect(record?.instances.length).toBe(3);
      expect(record?.instances[0]?.element).toBe(el1);
      expect(record?.instances[1]?.element).toBe(el2);
      expect(record?.instances[2]?.element).toBe(el3);
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

    it('preserves signal state across HMR when wrapper collects signals', () => {
      // Simulates real HMR: the codegen wrapper calls startSignalCollection/
      // stopSignalCollection around the factory, then passes signals to
      // __$refreshTrack. Without the refreshSignals stash fix, the nested
      // signal collection causes __$refreshPerform to get empty signals.

      // V1 factory creates a real signal (like `let count = 0` → signal(0))
      let sig1 = signal(0); // placeholder, overwritten by factory
      const rawV1 = () => {
        sig1 = signal(0);
        const el = document.createElement('div');
        el.textContent = 'v1';
        return el;
      };
      const factoryV1 = wrapFactory('mod1', 'App', rawV1);
      __$refreshReg('mod1', 'App', factoryV1);

      // Initial mount — wrapper collects sig1
      const el = factoryV1();
      mount(el);

      // User interaction: increment the signal
      sig1.value = 42;

      // HMR: new factory creates a fresh signal (initial value 0)
      let sig2 = signal(0); // placeholder, overwritten by factory
      const rawV2 = () => {
        sig2 = signal(0);
        const el = document.createElement('div');
        el.textContent = 'v2';
        return el;
      };
      const factoryV2 = wrapFactory('mod1', 'App', rawV2);
      __$refreshReg('mod1', 'App', factoryV2);

      __$refreshPerform('mod1');

      // Signal value should be restored: 42 from old signal → new signal
      expect(sig2.value).toBe(42);
      expect(document.body.textContent).toBe('v2');
    });

    it('updates all instances with different args inside a container (like .map())', () => {
      // Simulates: tasks.map(t => <TaskCard task={t} />) where testid uses task.id
      // Factory v1: data-testid="task-card-{id}"
      const factoryV1 = (props: { id: string }) => {
        const el = document.createElement('article');
        el.setAttribute('data-testid', `task-card-${props.id}`);
        el.textContent = `Card ${props.id}`;
        return el;
      };
      __$refreshReg('mod1', 'TaskCard', factoryV1 as (...args: unknown[]) => HTMLElement);

      // Mount 3 instances inside a container (like a list)
      const container = document.createElement('div');
      document.body.appendChild(container);

      const el1 = factoryV1({ id: '1' });
      const el2 = factoryV1({ id: '2' });
      const el3 = factoryV1({ id: '3' });
      container.appendChild(el1);
      container.appendChild(el2);
      container.appendChild(el3);

      __$refreshTrack('mod1', 'TaskCard', el1, [{ id: '1' }], [], null);
      __$refreshTrack('mod1', 'TaskCard', el2, [{ id: '2' }], [], null);
      __$refreshTrack('mod1', 'TaskCard', el3, [{ id: '3' }], [], null);

      // HMR update: change testid prefix from "task-card-" to "card-"
      const factoryV2 = (props: { id: string }) => {
        const el = document.createElement('article');
        el.setAttribute('data-testid', `card-${props.id}`);
        el.textContent = `Updated Card ${props.id}`;
        return el;
      };
      __$refreshReg('mod1', 'TaskCard', factoryV2 as (...args: unknown[]) => HTMLElement);
      __$refreshPerform('mod1');

      // ALL 3 instances should be updated
      expect(container.children.length).toBe(3);
      expect(container.children[0]?.getAttribute('data-testid')).toBe('card-1');
      expect(container.children[1]?.getAttribute('data-testid')).toBe('card-2');
      expect(container.children[2]?.getAttribute('data-testid')).toBe('card-3');
      expect(container.children[0]?.textContent).toBe('Updated Card 1');
      expect(container.children[1]?.textContent).toBe('Updated Card 2');
      expect(container.children[2]?.textContent).toBe('Updated Card 3');
    });
  });
});
