/**
 * Settings context — simplified version for Entity Todo.
 *
 * Provides app-wide theme preference (light/dark) without prop drilling.
 */

import type { Signal } from '@vertz/ui';
import { createContext, signal, useContext } from '@vertz/ui';

export type ThemeMode = 'light' | 'dark';

export interface SettingsContextValue {
  theme: Signal<ThemeMode>;
  setTheme: (theme: ThemeMode) => void;
}

export const SettingsContext = createContext<SettingsContextValue>();

export function createSettingsValue(): SettingsContextValue {
  const theme = signal<ThemeMode>('light');

  return {
    theme,
    setTheme(newTheme: ThemeMode) {
      theme.value = newTheme;
      document.documentElement.setAttribute('data-theme', newTheme);
    },
  };
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be called within a SettingsContext.Provider');
  }
  return ctx;
}
