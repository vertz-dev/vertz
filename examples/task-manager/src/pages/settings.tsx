/**
 * Settings page — theme switching and default preferences.
 *
 * Demonstrates:
 * - Fully declarative settings page — no effect() needed
 * - useContext() to consume the SettingsContext
 * - Compiler `let` → signal transform for local state (currentTheme, defaultPriority)
 * - Reactive JSX attributes via className={expr}
 * - Compiler conditional transform: {showSaved && <div>...</div>} → __conditional()
 * - Reactive class toggling via JSX expressions
 */

import { MoonIcon, SunIcon } from '@vertz/icons';
import { css, useContext } from '@vertz/ui';
import { SettingsContext } from '../lib/settings-context';
import { formStyles } from '../styles/components';

const settingsStyles = css({
  page: ['max-w:lg', 'mx:auto'],
  title: ['font:2xl', 'font:bold', 'text:foreground', 'mb:6'],
  section: ['mb:8'],
  sectionTitle: ['font:lg', 'font:semibold', 'text:foreground', 'mb:4'],
  themeGrid: ['grid', 'grid-cols:2', 'gap:4'],
  themeCard: ['p:4', 'rounded:lg', 'border:2', 'cursor:pointer', 'transition:all'],
  themeCardActive: ['border:primary'],
  themeCardInactive: ['border:border'],
  previewBox: ['p:3', 'rounded:md', 'mb:2'],
  previewText: ['text:sm'],
  savedMsg: ['text:sm', 'text:accent-foreground', 'mt:2'],
});

/**
 * Render the settings page with theme switching.
 */
export function SettingsPage() {
  const settings = useContext(SettingsContext)!;

  // Local state: compiler transforms `let` to signal()
  let showSaved = false;
  let currentTheme = settings.theme;
  let defaultPriority = settings.defaultPriority;

  function flashSaved(): void {
    showSaved = true;
    setTimeout(() => {
      showSaved = false;
    }, 2000);
  }

  function selectTheme(theme: 'light' | 'dark'): void {
    currentTheme = theme;
    settings.setTheme(theme);
    flashSaved();
  }

  // ── Page layout with JSX ────────────────────────────

  return (
    <div className={settingsStyles.page} data-testid="settings-page">
      <h1 className={settingsStyles.title}>Settings</h1>

      <section className={settingsStyles.section}>
        <h2 className={settingsStyles.sectionTitle}>Appearance</h2>
        <div className={settingsStyles.themeGrid}>
          <div
            className={`${settingsStyles.themeCard} ${
              currentTheme === 'light'
                ? settingsStyles.themeCardActive
                : settingsStyles.themeCardInactive
            }`}
            data-testid="theme-light"
            role="button"
            tabindex="0"
            onClick={() => selectTheme('light')}
          >
            <div
              className={settingsStyles.previewBox}
              style="background-color: #ffffff; display: flex; align-items: center; justify-content: center"
            >
              <SunIcon size={24} />
            </div>
            <div style="font-weight: 500">Light</div>
          </div>
          <div
            className={`${settingsStyles.themeCard} ${
              currentTheme === 'dark'
                ? settingsStyles.themeCardActive
                : settingsStyles.themeCardInactive
            }`}
            data-testid="theme-dark"
            role="button"
            tabindex="0"
            onClick={() => selectTheme('dark')}
          >
            <div
              className={settingsStyles.previewBox}
              style="background-color: #111827; color: #ffffff; display: flex; align-items: center; justify-content: center"
            >
              <MoonIcon size={24} />
            </div>
            <div style="font-weight: 500">Dark</div>
          </div>
        </div>
        {showSaved && (
          <div className={settingsStyles.savedMsg} data-testid="saved-message">
            Settings saved!
          </div>
        )}
      </section>

      <section className={settingsStyles.section}>
        <h2 className={settingsStyles.sectionTitle}>Default Priority</h2>
        <div className={formStyles.formGroup}>
          <select
            className={formStyles.select}
            data-testid="default-priority-select"
            onChange={(e: Event) => {
              const value = (e.target as HTMLSelectElement).value as
                | 'low'
                | 'medium'
                | 'high'
                | 'urgent';
              defaultPriority = value;
              settings.setDefaultPriority(value);
              flashSaved();
            }}
          >
            <option value="low" selected={defaultPriority === 'low'}>
              Low
            </option>
            <option value="medium" selected={defaultPriority === 'medium'}>
              Medium
            </option>
            <option value="high" selected={defaultPriority === 'high'}>
              High
            </option>
            <option value="urgent" selected={defaultPriority === 'urgent'}>
              Urgent
            </option>
          </select>
        </div>
      </section>
    </div>
  );
}
