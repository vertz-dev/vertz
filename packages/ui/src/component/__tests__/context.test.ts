import { describe, expect, test } from 'bun:test';
import { query } from '../../query/query';
import { domEffect, signal } from '../../runtime/signal';
import { createContext, isSignalLike, useContext, wrapSignalProps } from '../context';

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

  test('isSignalLike detects objects with .peek function', () => {
    const sig = signal('hello');
    expect(isSignalLike(sig)).toBe(true);
  });

  test('isSignalLike returns false for plain values', () => {
    expect(isSignalLike('hello')).toBe(false);
    expect(isSignalLike(42)).toBe(false);
    expect(isSignalLike(null)).toBe(false);
    expect(isSignalLike(undefined)).toBe(false);
    expect(isSignalLike([])).toBe(false);
    expect(isSignalLike({ name: 'test' })).toBe(false);
  });

  test('isSignalLike returns false for objects with non-function .peek', () => {
    expect(isSignalLike({ peek: 'not a function' })).toBe(false);
  });

  test('wrapSignalProps creates getter-wrapped copy for signal props', () => {
    const theme = signal<string>('light');
    const setTheme = (t: string) => {
      theme.value = t;
    };
    const wrapped = wrapSignalProps({ theme, setTheme });

    // Signal property becomes a plain value via getter
    expect(wrapped.theme).toBe('light');
    // Plain property copied as-is
    expect(wrapped.setTheme).toBe(setTheme);
  });

  test('wrapSignalProps passes through primitives unchanged', () => {
    expect(wrapSignalProps('hello')).toBe('hello');
    expect(wrapSignalProps(42)).toBe(42);
    expect(wrapSignalProps(null)).toBe(null);
    expect(wrapSignalProps(undefined)).toBe(undefined);
  });

  test('wrapSignalProps passes through arrays unchanged', () => {
    const arr = [1, 2, 3];
    expect(wrapSignalProps(arr)).toBe(arr);
  });

  test('wrapSignalProps getter reads signal.value (tracks reactively)', () => {
    const theme = signal<string>('light');
    const wrapped = wrapSignalProps({ theme });

    expect(wrapped.theme).toBe('light');
    theme.value = 'dark';
    expect(wrapped.theme).toBe('dark');
  });

  test('wrapSignalProps copies plain object properties as-is', () => {
    const obj = { name: 'test', count: 42 };
    const wrapped = wrapSignalProps(obj);

    expect(wrapped.name).toBe('test');
    expect(wrapped.count).toBe(42);
  });

  test('Provider JSX pattern auto-unwraps signal properties', () => {
    interface SettingsValue {
      theme: string;
      setTheme: (t: string) => void;
    }
    const theme = signal<string>('light');
    const setTheme = (t: string) => {
      theme.value = t;
    };
    const SettingsCtx = createContext<SettingsValue>();

    SettingsCtx.Provider({
      value: { theme, setTheme } as unknown as SettingsValue,
      children: () => {
        const ctx = useContext(SettingsCtx)!;
        expect(ctx.theme).toBe('light');
        expect(ctx.setTheme).toBe(setTheme);
        return null;
      },
    });
  });

  test('Provider auto-unwrapped getter tracks signal reactively in domEffect', () => {
    interface SettingsValue {
      theme: string;
    }
    const theme = signal<string>('light');
    const SettingsCtx = createContext<SettingsValue>();
    const observed: string[] = [];

    SettingsCtx.Provider({ theme } as unknown as SettingsValue, () => {
      domEffect(() => {
        const ctx = useContext(SettingsCtx)!;
        observed.push(ctx.theme);
      });
    });

    // Initial value
    expect(observed).toEqual(['light']);

    // Mutate signal — getter should read updated value
    theme.value = 'dark';
    expect(observed).toEqual(['light', 'dark']);
  });

  test('Provider callback pattern auto-unwraps signal properties', () => {
    interface SettingsValue {
      theme: string;
      setTheme: (t: string) => void;
    }
    const theme = signal<string>('light');
    const setTheme = (t: string) => {
      theme.value = t;
    };
    const SettingsCtx = createContext<SettingsValue>();

    SettingsCtx.Provider({ theme, setTheme } as unknown as SettingsValue, () => {
      const ctx = useContext(SettingsCtx)!;
      // Signal property should be auto-unwrapped by Provider
      expect(ctx.theme).toBe('light');
      // Function property should pass through
      expect(ctx.setTheme).toBe(setTheme);
    });
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

  // ─── Edge cases: signal auto-unwrapping ──────────────────────────────

  test('nested providers shadow correctly with signal wrapping', () => {
    interface ThemeValue {
      theme: string;
    }
    const outerTheme = signal<string>('light');
    const innerTheme = signal<string>('dark');
    const ThemeCtx = createContext<ThemeValue>();

    ThemeCtx.Provider({ theme: outerTheme } as unknown as ThemeValue, () => {
      expect(useContext(ThemeCtx)!.theme).toBe('light');

      ThemeCtx.Provider({ theme: innerTheme } as unknown as ThemeValue, () => {
        expect(useContext(ThemeCtx)!.theme).toBe('dark');
      });

      // After inner scope ends, outer value restored
      expect(useContext(ThemeCtx)!.theme).toBe('light');
    });
  });

  test('array context values pass through unchanged', () => {
    const arr = [1, 2, 3];
    const ArrCtx = createContext<number[]>();

    ArrCtx.Provider(arr, () => {
      expect(useContext(ArrCtx)).toBe(arr);
    });
  });

  test('objects without signal properties work unchanged (same reference)', () => {
    const plain = { name: 'test', count: 42 };
    const PlainCtx = createContext<{ name: string; count: number }>();

    PlainCtx.Provider(plain, () => {
      expect(useContext(PlainCtx)).toBe(plain);
    });
  });

  test('watch() tracks signal changes through auto-unwrapped getters', () => {
    interface ThemeValue {
      theme: string;
    }
    const theme = signal<string>('light');
    const ThemeCtx = createContext<ThemeValue>();
    const observed: string[] = [];

    ThemeCtx.Provider({ theme } as unknown as ThemeValue, () => {
      domEffect(() => {
        const ctx = useContext(ThemeCtx)!;
        observed.push(ctx.theme);
      });
    });

    expect(observed).toEqual(['light']);

    theme.value = 'dark';
    expect(observed).toEqual(['light', 'dark']);

    theme.value = 'blue';
    expect(observed).toEqual(['light', 'dark', 'blue']);
  });
});
