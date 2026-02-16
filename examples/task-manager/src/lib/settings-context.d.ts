/**
 * Settings context — demonstrates createContext/useContext.
 *
 * The settings context provides app-wide access to user preferences
 * (theme, default priority) without prop drilling.
 */
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
export declare const SettingsContext: import("@vertz/ui").Context<SettingsContextValue>;
/**
 * Create a settings value for use with SettingsContext.Provider.
 *
 * Returns the reactive settings object that should be passed to the Provider.
 */
export declare function createSettingsValue(): SettingsContextValue;
/**
 * Convenience accessor for settings inside components.
 * Throws if called outside SettingsContext.Provider.
 */
export declare function useSettings(): SettingsContextValue;
//# sourceMappingURL=settings-context.d.ts.map