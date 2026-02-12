/**
 * Settings context — demonstrates createContext/useContext.
 *
 * The settings context provides app-wide access to user preferences
 * (theme, default priority) without prop drilling.
 */

import { createContext, signal, useContext } from '@vertz/ui';
import type { Signal } from '@vertz/ui';
import type { Settings, TaskPriority } from './types';

export interface SettingsContextValue {
  theme: Signal<Settings['theme']>;
  defaultPriority: Signal<TaskPriority>;
  setTheme: (theme: Settings['theme']) => void;
  setDefaultPriority: (priority: TaskPriority) => void;
}

/**
 * Create the context with no default value.
 * Components must be rendered inside a SettingsProvider.
 */
export const SettingsContext = createContext<SettingsContextValue>();

/**
 * Create a settings value for use with SettingsContext.Provider.
 *
 * Returns the reactive settings object that should be passed to the Provider.
 */
export function createSettingsValue(): SettingsContextValue {
  const theme = signal<Settings['theme']>('light');
  const defaultPriority = signal<TaskPriority>('medium');

  return {
    theme,
    defaultPriority,
    setTheme(newTheme: Settings['theme']) {
      theme.value = newTheme;
      // In a real app, persist to localStorage
      document.documentElement.setAttribute('data-theme', newTheme);
    },
    setDefaultPriority(priority: TaskPriority) {
      defaultPriority.value = priority;
    },
  };
}

/**
 * Convenience accessor for settings inside components.
 * Throws if called outside SettingsContext.Provider.
 */
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be called within a SettingsContext.Provider');
  }
  return ctx;
}
