/**
 * Settings context — demonstrates createContext/useContext.
 *
 * The settings context provides app-wide access to user preferences
 * (theme, default priority) without prop drilling.
 */
import { createContext, signal, useContext } from '@vertz/ui';
/**
 * Create the context with no default value.
 * Components must be rendered inside a SettingsProvider.
 */
export const SettingsContext = createContext();
/**
 * Create a settings value for use with SettingsContext.Provider.
 *
 * Returns the reactive settings object that should be passed to the Provider.
 */
export function createSettingsValue() {
    const theme = signal('light');
    const defaultPriority = signal('medium');
    return {
        theme,
        defaultPriority,
        setTheme(newTheme) {
            theme.value = newTheme;
            // In a real app, persist to localStorage
            document.documentElement.setAttribute('data-theme', newTheme);
        },
        setDefaultPriority(priority) {
            defaultPriority.value = priority;
        },
    };
}
/**
 * Convenience accessor for settings inside components.
 * Throws if called outside SettingsContext.Provider.
 */
export function useSettings() {
    const ctx = useContext(SettingsContext);
    if (!ctx) {
        throw new Error('useSettings must be called within a SettingsContext.Provider');
    }
    return ctx;
}
//# sourceMappingURL=settings-context.js.map