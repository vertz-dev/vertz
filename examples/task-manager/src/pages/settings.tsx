/**
 * Settings page — theme switching and default preferences.
 *
 * Demonstrates:
 * - Fully declarative settings page — no effect() needed
 * - useContext() to consume the SettingsContext
 * - Compiler `let` → signal transform for local state (currentTheme, defaultPriority)
 * - Reactive JSX attributes via class={expr}
 * - Compiler conditional transform: {showSaved && <div>...</div>} → __conditional()
 * - Reactive class toggling via JSX expressions
 */

import { css } from '@vertz/ui';
import { useSettings } from '../lib/settings-context';
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
  const settings = useSettings();

  // Local state: compiler transforms `let` to signal()
  let showSaved = false;
  let currentTheme = settings.theme.peek();
  let defaultPriority = settings.defaultPriority.peek();

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
    <div class={settingsStyles.page} data-testid="settings-page">
      <h1 class={settingsStyles.title}>Settings</h1>

      <section class={settingsStyles.section}>
        <h2 class={settingsStyles.sectionTitle}>Appearance</h2>
        <div class={settingsStyles.themeGrid}>
          <div
            class={`${settingsStyles.themeCard} ${
              currentTheme === 'light'
                ? settingsStyles.themeCardActive
                : settingsStyles.themeCardInactive
            }`}
            data-testid="theme-light"
            role="button"
            tabindex="0"
            onClick={() => selectTheme('light')}
          >
            <div class={settingsStyles.previewBox} style="background-color: #ffffff">
              <div class={settingsStyles.previewText}>Light theme preview</div>
            </div>
            <div style="font-weight: 500">Light</div>
          </div>
          <div
            class={`${settingsStyles.themeCard} ${
              currentTheme === 'dark'
                ? settingsStyles.themeCardActive
                : settingsStyles.themeCardInactive
            }`}
            data-testid="theme-dark"
            role="button"
            tabindex="0"
            onClick={() => selectTheme('dark')}
          >
            <div class={settingsStyles.previewBox} style="background-color: #111827">
              <div class={settingsStyles.previewText}>Dark theme preview</div>
            </div>
            <div style="font-weight: 500">Dark</div>
          </div>
        </div>
        {showSaved && (
          <div class={settingsStyles.savedMsg} data-testid="saved-message">
            Settings saved!
          </div>
        )}
      </section>

      <section class={settingsStyles.section}>
        <h2 class={settingsStyles.sectionTitle}>Default Priority</h2>
        <div class={formStyles.formGroup}>
          <select
            class={formStyles.select}
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
