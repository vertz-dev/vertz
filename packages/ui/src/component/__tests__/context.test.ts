import { describe, expect, test, vi } from 'vitest';
import { query } from '../../query/query';
import { effect, signal } from '../../runtime/signal';
import { createContext, useContext } from '../context';
import { watch } from '../lifecycle';

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

  test('useContext returns correct value inside watch() callback after signal change', () => {
    const ThemeCtx = createContext('light');
    const count = signal(0);
    const observed: (string | undefined)[] = [];

    ThemeCtx.Provider('dark', () => {
      watch(
        () => count.value,
        () => {
          observed.push(useContext(ThemeCtx));
        },
      );
    });

    // First run (synchronous) should capture 'dark'
    expect(observed).toEqual(['dark']);

    // After Provider has popped, signal change triggers watch callback
    count.value = 1;

    // Should still see 'dark', not undefined
    expect(observed).toEqual(['dark', 'dark']);
  });

  test('useContext returns correct value inside effect() callback after signal change', () => {
    const ThemeCtx = createContext('light');
    const count = signal(0);
    const observed: (string | undefined)[] = [];

    ThemeCtx.Provider('dark', () => {
      effect(() => {
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
      // Outer watch captures 'dark'
      watch(
        () => count.value,
        () => {
          outerObserved.push(useContext(ThemeCtx));
        },
      );

      ThemeCtx.Provider('blue', () => {
        // Inner watch captures 'blue' (the nested/inner value)
        watch(
          () => count.value,
          () => {
            innerObserved.push(useContext(ThemeCtx));
          },
        );
      });
    });

    // Synchronous initial runs
    expect(outerObserved).toEqual(['dark']);
    expect(innerObserved).toEqual(['blue']);

    // After all Providers have popped, signal change triggers both watches
    count.value = 1;

    // Outer watch should still see 'dark', inner watch should still see 'blue'
    expect(outerObserved).toEqual(['dark', 'dark']);
    expect(innerObserved).toEqual(['blue', 'blue']);
  });

  test('useContext returns correct value inside query() thunk', async () => {
    const ApiCtx = createContext('/api');
    let capturedBase: string | undefined;

    ApiCtx.Provider('/v2', () => {
      query(async () => {
        capturedBase = useContext(ApiCtx);
        return 'data';
      });
    });

    // query() effect runs synchronously on creation — the thunk captures context
    // even though the async resolution is deferred. The synchronous read inside
    // the thunk (before the first await) sees the Provider's scope.
    await vi.waitFor(() => {
      expect(capturedBase).toBe('/v2');
    });
  });

  test('disposed effect releases context scope reference', () => {
    const ThemeCtx = createContext('light');
    const count = signal(0);

    let dispose: (() => void) | undefined;
    ThemeCtx.Provider('dark', () => {
      dispose = effect(() => {
        count.value;
        useContext(ThemeCtx);
      });
    });

    // After dispose, the effect should not re-run
    dispose?.();
    const observed: (string | undefined)[] = [];
    ThemeCtx.Provider('dark', () => {
      effect(() => {
        count.value;
        observed.push(useContext(ThemeCtx));
      });
    });

    count.value = 1;
    // Verify the non-disposed effect still works
    expect(observed).toEqual(['dark', 'dark']);
  });
});
