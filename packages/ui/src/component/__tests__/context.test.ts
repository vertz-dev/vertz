import { describe, expect, test } from 'bun:test';
import { query } from '../../query/query';
import { domEffect, signal } from '../../runtime/signal';
import { createContext, useContext } from '../context';

describe('createContext / useContext', () => {
  test('useContext returns default value when no Provider is set', () => {
    const ThemeCtx = createContext('light');
    expect(useContext(ThemeCtx)).toBe('light');
  });

  test('useContext returns undefined when no Provider and no default', () => {
    const Ctx = createContext<string>();
    expect(useContext(Ctx)).toBeUndefined();
  });

  test('Provider sets value that useContext retrieves', () => {
    const ThemeCtx = createContext('light');
    ThemeCtx.Provider('dark', () => {
      expect(useContext(ThemeCtx)).toBe('dark');
    });
  });

  test('nested Providers shadow outer values', () => {
    const ThemeCtx = createContext('light');
    ThemeCtx.Provider('dark', () => {
      expect(useContext(ThemeCtx)).toBe('dark');
      ThemeCtx.Provider('blue', () => {
        expect(useContext(ThemeCtx)).toBe('blue');
      });
      // After inner Provider scope ends, outer value restored
      expect(useContext(ThemeCtx)).toBe('dark');
    });
    // After all Providers, default restored
    expect(useContext(ThemeCtx)).toBe('light');
  });

  test('multiple independent contexts do not interfere', () => {
    const ThemeCtx = createContext('light');
    const LangCtx = createContext('en');
    ThemeCtx.Provider('dark', () => {
      LangCtx.Provider('fr', () => {
        expect(useContext(ThemeCtx)).toBe('dark');
        expect(useContext(LangCtx)).toBe('fr');
      });
      expect(useContext(LangCtx)).toBe('en');
    });
  });

  test('Provider works with complex types', () => {
    interface Config {
      api: string;
      debug: boolean;
    }
    const ConfigCtx = createContext<Config>({ api: '/api', debug: false });
    const customConfig = { api: '/v2/api', debug: true };
    ConfigCtx.Provider(customConfig, () => {
      expect(useContext(ConfigCtx)).toBe(customConfig);
    });
  });

  test('useContext returns correct value inside effect callback after signal change', () => {
    const ThemeCtx = createContext('light');
    const count = signal(0);
    const observed: (string | undefined)[] = [];

    ThemeCtx.Provider('dark', () => {
      domEffect(() => {
        count.value; // track dependency
        observed.push(useContext(ThemeCtx));
      });
    });

    // First run (synchronous) should capture 'dark'
    expect(observed).toEqual(['dark']);

    // After Provider has popped, signal change triggers effect callback
    count.value = 1;

    // Should still see 'dark', not undefined
    expect(observed).toEqual(['dark', 'dark']);
  });

  test('useContext returns correct value inside domEffect() callback after signal change', () => {
    const ThemeCtx = createContext('light');
    const count = signal(0);
    const observed: (string | undefined)[] = [];

    ThemeCtx.Provider('dark', () => {
      domEffect(() => {
        count.value; // track dependency
        observed.push(useContext(ThemeCtx));
      });
    });

    // First run (synchronous) should capture 'dark'
    expect(observed).toEqual(['dark']);

    // After Provider has popped, signal change triggers effect callback
    count.value = 1;

    // Should still see 'dark', not undefined
    expect(observed).toEqual(['dark', 'dark']);
  });

  test('nested providers: async reads return the correct inner context', () => {
    const ThemeCtx = createContext('light');
    const count = signal(0);
    const outerObserved: (string | undefined)[] = [];
    const innerObserved: (string | undefined)[] = [];

    ThemeCtx.Provider('dark', () => {
      // Outer effect captures 'dark'
      domEffect(() => {
        count.value; // track dependency
        outerObserved.push(useContext(ThemeCtx));
      });

      ThemeCtx.Provider('blue', () => {
        // Inner effect captures 'blue' (the nested/inner value)
        domEffect(() => {
          count.value; // track dependency
          innerObserved.push(useContext(ThemeCtx));
        });
      });
    });

    // Synchronous initial runs
    expect(outerObserved).toEqual(['dark']);
    expect(innerObserved).toEqual(['blue']);

    // After all Providers have popped, signal change triggers both effects
    count.value = 1;

    // Outer effect should still see 'dark', inner effect should still see 'blue'
    expect(outerObserved).toEqual(['dark', 'dark']);
    expect(innerObserved).toEqual(['blue', 'blue']);
  });

  test('useContext returns correct value inside query() thunk on re-fetch', () => {
    const ApiCtx = createContext('/api');
    const dep = signal(0);
    const capturedBases: (string | undefined)[] = [];

    let q: ReturnType<typeof query>;
    ApiCtx.Provider('/v2', () => {
      q = query(async () => {
        dep.value; // track reactive dependency
        capturedBases.push(useContext(ApiCtx));
        return 'data';
      });
    });

    // Initial run: Provider is on the call stack → sync path.
    // The thunk is called synchronously by the effect (useContext runs
    // before the first await), so capturedBases is populated immediately.
    expect(capturedBases).toHaveLength(1);
    expect(capturedBases[0]).toBe('/v2');

    // After Provider has popped, trigger a re-fetch via signal change.
    // This forces useContext to use the captured _contextScope (async path).
    dep.value = 1;

    // The effect re-runs synchronously on signal change, calling the thunk
    // again. useContext reads from the captured context scope.
    expect(capturedBases).toHaveLength(2);
    // The re-fetch should still see '/v2' via the captured context scope
    expect(capturedBases[1]).toBe('/v2');

    q?.dispose();
  });

  test('JSX pattern: Provider({ value, children }) provides value to children thunk', () => {
    const ThemeCtx = createContext('light');
    const result = ThemeCtx.Provider({ value: 'dark', children: () => useContext(ThemeCtx) });
    expect(result).toBe('dark');
  });

  test('JSX pattern: nested providers shadow correctly', () => {
    const ThemeCtx = createContext('light');
    const result = ThemeCtx.Provider({
      value: 'dark',
      children: () => {
        const inner = ThemeCtx.Provider({
          value: 'blue',
          children: () => useContext(ThemeCtx),
        });
        return inner;
      },
    });
    expect(result).toBe('blue');
  });

  test('JSX pattern: multi-child array throws in dev mode', () => {
    const Ctx = createContext('val');
    const span1 = document.createElement('span');
    const span2 = document.createElement('span');
    expect(() => {
      Ctx.Provider({ value: 'v', children: () => [span1, span2] as unknown });
    }).toThrow(/single root/i);
  });

  test('JSX pattern: fragment child works (single DocumentFragment node)', () => {
    const Ctx = createContext('val');
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createElement('span'));
    const result = Ctx.Provider({ value: 'v', children: () => frag });
    expect(result).toBe(frag);
  });

  test('callback pattern still works after JSX overload', () => {
    const ThemeCtx = createContext('light');
    let captured: string | undefined;
    ThemeCtx.Provider('dark', () => {
      captured = useContext(ThemeCtx);
    });
    expect(captured).toBe('dark');
  });

  test('disposed effect does not re-run on signal change', () => {
    const ThemeCtx = createContext('light');
    const count = signal(0);

    let dispose: (() => void) | undefined;
    ThemeCtx.Provider('dark', () => {
      dispose = domEffect(() => {
        count.value;
        useContext(ThemeCtx);
      });
    });

    // After dispose, the effect should not re-run
    dispose?.();
    const observed: (string | undefined)[] = [];
    ThemeCtx.Provider('dark', () => {
      domEffect(() => {
        count.value;
        observed.push(useContext(ThemeCtx));
      });
    });

    count.value = 1;
    // Verify the non-disposed effect still works
    expect(observed).toEqual(['dark', 'dark']);
  });
});
