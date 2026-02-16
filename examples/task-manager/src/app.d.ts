/**
 * App shell — root component with sidebar navigation and theme switching.
 *
 * Demonstrates:
 * - JSX for layout composition
 * - ThemeProvider for theme context
 * - createContext / useContext for app-wide settings
 * - effect() for reactive route rendering (driven by external router signal)
 * - Full composition of all @vertz/ui features
 *
 * Note: All reactive state here comes from external signals (appRouter.current,
 * settings.theme), so effect() is still needed. No local `let` → signal
 * transform applies in this file.
 */
/**
 * Create the root app element.
 *
 * The app is wrapped in:
 * 1. SettingsContext.Provider — for app-wide settings access
 * 2. ThemeProvider — for CSS custom property switching
 */
export declare function App(): HTMLElement;
//# sourceMappingURL=app.d.ts.map