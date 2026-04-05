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
import { __$refreshReg, __$refreshTrack } from '../bun-plugin/fast-refresh-runtime';
import { collectStateSnapshot, safeSerialize } from '../bun-plugin/state-inspector';

// ── Registry Cleanup ──────────────────────────────────────────────

const REGISTRY_KEY = Symbol.for('vertz:fast-refresh:registry');
const DIRTY_KEY = Symbol.for('vertz:fast-refresh:dirty');

function clearRegistry(): void {
  const reg = (globalThis as Record<symbol, Map<string, unknown>>)[REGISTRY_KEY];
  if (reg) reg.clear();
  const dirty = (globalThis as Record<symbol, Set<string>>)[DIRTY_KEY];
  if (dirty) dirty.clear();
}

// ── Helpers ────────────────────────────────────────────────────────

interface SignalRef {
  peek(): unknown;
  value: unknown;
}

function mount(el: HTMLElement): void {
  document.body.appendChild(el);
}

// ── safeSerialize Tests ───────────────────────────────────────���────

describe('safeSerialize', () => {
  it('serializes primitives as-is', () => {
    expect(safeSerialize('hello')).toBe('hello');
    expect(safeSerialize(42)).toBe(42);
    expect(safeSerialize(true)).toBe(true);
    expect(safeSerialize(null)).toBe(null);
  });

  it('serializes undefined as null', () => {
    expect(safeSerialize(undefined)).toBe(null);
  });

  it('serializes bigint as string', () => {
    expect(safeSerialize(BigInt(9007199254740991))).toBe('9007199254740991');
  });

  it('serializes NaN as placeholder', () => {
    expect(safeSerialize(NaN)).toBe('[NaN]');
  });

  it('serializes Infinity as placeholder', () => {
    expect(safeSerialize(Infinity)).toBe('[Infinity]');
    expect(safeSerialize(-Infinity)).toBe('[-Infinity]');
  });

  it('serializes functions with name', () => {
    function handleClick() {}
    expect(safeSerialize(handleClick)).toBe('[Function: handleClick]');
  });

  it('serializes anonymous functions', () => {
    expect(safeSerialize(() => {})).toBe('[Function]');
  });

  it('serializes Date as ISO string', () => {
    const date = new Date('2026-04-05T12:00:00.000Z');
    expect(safeSerialize(date)).toBe('2026-04-05T12:00:00.000Z');
  });

  it('serializes Error as object with name and message', () => {
    const err = new TypeError('bad input');
    const result = safeSerialize(err) as { name: string; message: string };
    expect(result.name).toBe('TypeError');
    expect(result.message).toBe('bad input');
  });

  it('serializes Map as placeholder', () => {
    const m = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    expect(safeSerialize(m)).toBe('[Map: 2 entries]');
  });

  it('serializes Set as placeholder', () => {
    const s = new Set([1, 2, 3]);
    expect(safeSerialize(s)).toBe('[Set: 3 items]');
  });

  it('serializes Promise as placeholder', () => {
    expect(safeSerialize(Promise.resolve(42))).toBe('[Promise]');
  });

  it('serializes Symbol as placeholder', () => {
    expect(safeSerialize(Symbol('test'))).toBe('[Symbol: test]');
    expect(safeSerialize(Symbol())).toBe('[Symbol]');
  });

  it('serializes WeakMap/WeakSet/WeakRef as placeholders', () => {
    expect(safeSerialize(new WeakMap())).toBe('[WeakMap]');
    expect(safeSerialize(new WeakSet())).toBe('[WeakSet]');
    expect(safeSerialize(new WeakRef({}))).toBe('[WeakRef]');
  });

  it('serializes ArrayBuffer as placeholder', () => {
    expect(safeSerialize(new ArrayBuffer(16))).toBe('[ArrayBuffer: 16 bytes]');
  });

  it('serializes TypedArray as placeholder', () => {
    expect(safeSerialize(new Uint8Array(8))).toBe('[ArrayBuffer: 8 bytes]');
  });

  it('serializes HTMLElement as placeholder', () => {
    const el = document.createElement('div');
    expect(safeSerialize(el)).toBe('[HTMLElement: DIV]');
  });

  it('serializes plain objects recursively', () => {
    const obj = { a: 1, b: 'hello', c: true };
    expect(safeSerialize(obj)).toEqual({ a: 1, b: 'hello', c: true });
  });

  it('serializes arrays recursively', () => {
    const arr = [1, 'two', false];
    expect(safeSerialize(arr)).toEqual([1, 'two', false]);
  });

  it('handles circular references', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const result = safeSerialize(obj) as Record<string, unknown>;
    expect(result.a).toBe(1);
    expect(result.self).toBe('[Circular]');
  });

  it('truncates objects at max depth', () => {
    const deep = { l1: { l2: { l3: { l4: { l5: 'too deep' } } } } };
    const result = safeSerialize(deep, 4) as Record<string, unknown>;
    const l1 = result.l1 as Record<string, unknown>;
    const l2 = l1.l2 as Record<string, unknown>;
    const l3 = l2.l3 as Record<string, unknown>;
    // At depth 4, l4 should be truncated
    expect(l3.l4).toBe('[Object: 1 keys]');
  });

  it('truncates arrays at max depth', () => {
    const deep = { l1: { l2: { l3: { l4: [1, 2, 3] } } } };
    const result = safeSerialize(deep, 4) as Record<string, unknown>;
    const l1 = result.l1 as Record<string, unknown>;
    const l2 = l1.l2 as Record<string, unknown>;
    const l3 = l2.l3 as Record<string, unknown>;
    expect(l3.l4).toBe('[Array: 3 items]');
  });
});

// ── collectStateSnapshot Tests ─────────────────────────────────────

describe('collectStateSnapshot', () => {
  beforeEach(() => {
    clearRegistry();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    clearRegistry();
    document.body.innerHTML = '';
  });

  it('returns empty snapshot when registry is empty', () => {
    const snapshot = collectStateSnapshot();
    expect(snapshot.components).toEqual([]);
    expect(snapshot.totalInstances).toBe(0);
    expect(snapshot.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('collects signal values from mounted component instances', () => {
    // Create a factory that uses signals
    const factory = () => {
      const count = signal(42, 'count');
      const name = signal('hello', 'name');
      const el = document.createElement('div');
      el.textContent = `${count.value} ${name.value}`;
      return el;
    };

    // Register and mount
    const wrappedFactory = (...args: unknown[]) => {
      startSignalCollection();
      const el = factory();
      const sigs = stopSignalCollection() as SignalRef[];
      return __$refreshTrack('/src/Counter.tsx', 'Counter', el, args, [], null, sigs);
    };
    __$refreshReg('/src/Counter.tsx', 'Counter', wrappedFactory);
    const el = wrappedFactory();
    mount(el);

    const snapshot = collectStateSnapshot();
    expect(snapshot.components.length).toBe(1);
    expect(snapshot.components[0].name).toBe('Counter');
    expect(snapshot.components[0].moduleId).toBe('/src/Counter.tsx');
    expect(snapshot.components[0].instanceCount).toBe(1);
    expect(snapshot.components[0].instances[0].signals.count).toBe(42);
    expect(snapshot.components[0].instances[0].signals.name).toBe('hello');
  });

  it('filters by component name (case-sensitive)', () => {
    // Register two components
    const factory1 = () => document.createElement('div');
    const factory2 = () => document.createElement('span');

    const wrap = (moduleId: string, name: string, f: () => HTMLElement) => {
      const wrapped = (...args: unknown[]) => {
        startSignalCollection();
        const el = f();
        const sigs = stopSignalCollection() as SignalRef[];
        return __$refreshTrack(moduleId, name, el, args, [], null, sigs);
      };
      __$refreshReg(moduleId, name, wrapped);
      return wrapped;
    };

    const w1 = wrap('/src/A.tsx', 'Alpha', factory1);
    const w2 = wrap('/src/B.tsx', 'Beta', factory2);
    mount(w1());
    mount(w2());

    const filtered = collectStateSnapshot('Alpha');
    expect(filtered.components.length).toBe(1);
    expect(filtered.components[0].name).toBe('Alpha');
  });

  it('groups query signals by _queryGroup with _hmrKey names', () => {
    // Simulates real query() behavior: signals have both _queryGroup and _hmrKey.
    // query() in dev mode sets _hmrKey on each user-facing signal (data, loading, etc.)
    // and _queryGroup for grouping.
    const factory = () => {
      const data = signal(undefined, 'data');
      (data as Record<string, unknown>)._queryGroup = 'tasks';
      (data as Record<string, unknown>)._hmrKey = 'data';
      const loading = signal(true, 'loading');
      (loading as Record<string, unknown>)._queryGroup = 'tasks';
      (loading as Record<string, unknown>)._hmrKey = 'loading';
      const revalidating = signal(false, 'revalidating');
      (revalidating as Record<string, unknown>)._queryGroup = 'tasks';
      (revalidating as Record<string, unknown>)._hmrKey = 'revalidating';
      const error = signal(null, 'error');
      (error as Record<string, unknown>)._queryGroup = 'tasks';
      (error as Record<string, unknown>)._hmrKey = 'error';
      const idle = signal(false, 'idle');
      (idle as Record<string, unknown>)._queryGroup = 'tasks';
      (idle as Record<string, unknown>)._hmrKey = 'idle';

      // A standalone signal (not part of any query)
      const count = signal(5, 'count');

      const el = document.createElement('div');
      return el;
    };

    const wrapped = (...args: unknown[]) => {
      startSignalCollection();
      const el = factory();
      const sigs = stopSignalCollection() as SignalRef[];
      return __$refreshTrack('/src/TaskList.tsx', 'TaskList', el, args, [], null, sigs);
    };
    __$refreshReg('/src/TaskList.tsx', 'TaskList', wrapped);
    mount(wrapped());

    const snapshot = collectStateSnapshot();
    const comp = snapshot.components[0];
    const inst = comp.instances[0];

    // Query signals grouped under 'tasks' with correct values
    expect(inst.queries.tasks).toBeDefined();
    expect(inst.queries.tasks.data).toBe(null); // undefined serialized to null
    expect(inst.queries.tasks.loading).toBe(true);
    expect(inst.queries.tasks.revalidating).toBe(false);
    expect(inst.queries.tasks.error).toBe(null);
    expect(inst.queries.tasks.idle).toBe(false);
    expect(inst.queries.tasks.key).toBe('tasks');

    // Standalone signal not in queries
    expect(inst.signals.count).toBe(5);
    expect(inst.signals.data).toBeUndefined();
  });

  it('returns "registered but not mounted" message', () => {
    const factory = () => document.createElement('div');
    const wrapped = (...args: unknown[]) => {
      const el = factory();
      return __$refreshTrack('/src/Panel.tsx', 'Panel', el, args, [], null, []);
    };
    __$refreshReg('/src/Panel.tsx', 'Panel', wrapped);
    // Call but don't mount (element is not connected)
    wrapped();

    const snapshot = collectStateSnapshot('Panel');
    expect(snapshot.components).toEqual([]);
    expect(snapshot.message).toContain('registered');
    expect(snapshot.message).toContain('0 mounted instances');
  });

  it('returns "not in registry" message for unknown component', () => {
    const snapshot = collectStateSnapshot('NonExistent');
    expect(snapshot.components).toEqual([]);
    expect(snapshot.message).toContain('not in the component registry');
  });

  it('skips disconnected instances', () => {
    const factory = () => document.createElement('div');
    const wrapped = (...args: unknown[]) => {
      startSignalCollection();
      const el = factory();
      const sigs = stopSignalCollection() as SignalRef[];
      return __$refreshTrack('/src/Item.tsx', 'Item', el, args, [], null, sigs);
    };
    __$refreshReg('/src/Item.tsx', 'Item', wrapped);

    const el1 = wrapped();
    mount(el1);
    const el2 = wrapped(); // Not mounted

    const snapshot = collectStateSnapshot();
    const comp = snapshot.components.find((c) => c.name === 'Item');
    expect(comp?.instanceCount).toBe(1);
  });

  it('assigns positional names to unnamed signals', () => {
    const factory = () => {
      signal(10); // no hmrKey
      signal(20); // no hmrKey
      const el = document.createElement('div');
      return el;
    };

    const wrapped = (...args: unknown[]) => {
      startSignalCollection();
      const el = factory();
      const sigs = stopSignalCollection() as SignalRef[];
      return __$refreshTrack('/src/Anon.tsx', 'Anon', el, args, [], null, sigs);
    };
    __$refreshReg('/src/Anon.tsx', 'Anon', wrapped);
    mount(wrapped());

    const snapshot = collectStateSnapshot();
    const inst = snapshot.components[0].instances[0];
    expect(inst.signals.signal_0).toBe(10);
    expect(inst.signals.signal_1).toBe(20);
  });

  it('handles signals whose peek() throws (peekSafe)', () => {
    const factory = () => {
      // Create a signal, then manually make peek() throw to simulate
      // a dirty computed that fails during recomputation
      const s = signal(42, 'broken');
      (s as Record<string, unknown>).peek = () => {
        throw new Error('recomputation failed');
      };
      const el = document.createElement('div');
      return el;
    };

    const wrapped = (...args: unknown[]) => {
      startSignalCollection();
      const el = factory();
      const sigs = stopSignalCollection() as SignalRef[];
      return __$refreshTrack('/src/Broken.tsx', 'Broken', el, args, [], null, sigs);
    };
    __$refreshReg('/src/Broken.tsx', 'Broken', wrapped);
    mount(wrapped());

    const snapshot = collectStateSnapshot();
    const inst = snapshot.components[0].instances[0];
    expect(inst.signals.broken).toBe('[Error: recomputation failed]');
  });
});
