/**
 * Settings page — theme switching and default preferences.
 *
 * Demonstrates:
 * - JSX for settings layout with theme cards
 * - useContext() to consume the SettingsContext
 * - Compiler `let` → signal transform for local state
 * - Reactive JSX attributes via className={expr}
 * - Compiler conditional transform: {showSaved && <div>...</div>} → __conditional()
 * - watch() to observe theme changes
 * - ThemeProvider for live theme preview
 */
export interface SettingsPageProps {
    navigate: (url: string) => void;
}
/**
 * Render the settings page with theme switching.
 */
export declare function SettingsPage(_props: SettingsPageProps): HTMLElement;
//# sourceMappingURL=settings.d.ts.map