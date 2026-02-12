import { describe, expect, test } from 'vitest';
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
});
