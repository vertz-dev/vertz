/**
 * Settings page — theme switching and default preferences.
 *
 * Demonstrates:
 * - Fully declarative settings page — no effect() needed
 * - useContext() to consume the SettingsContext
 * - Compiler `let` → signal transform for local state (currentTheme, defaultPriority)
 * - Reactive JSX attributes via class={expr}
 * - Compiler conditional transform: {showSaved && <div>...</div>} → __conditional()
 * - watch() to observe theme changes
 */

import { css, watch } from '@vertz/ui';
import { useSettings } from '../lib/settings-context';
import { formStyles } from '../styles/components';

const settingsStyles = css({
  page: ['max-w:lg', 'mx:auto'],
  title: ['font:2xl', 'font:bold', 'text:foreground', 'mb:6'],
  section: ['mb:8'],
  sectionTitle: ['font:lg', 'font:semibold', 'text:foreground', 'mb:4'],
  themeGrid: ['grid', 'grid-cols:2', 'gap:4'],
  themeCard: ['p:4', 'rounded:lg', 'border:2', 'cursor:pointer', 'transition:all'],
  themeCardActive: ['border:primary.500'],
  themeCardInactive: ['border:border'],
  previewBox: ['p:3', 'rounded:md', 'mb:2'],
  previewText: ['text:sm'],
  savedMsg: ['text:sm', 'text:success.500', 'mt:2'],
});

export interface SettingsPageProps {
  navigate: (url: string) => void;
}

/**
 * Render the settings page with theme switching.
 */
export function SettingsPage(_props: SettingsPageProps) {
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

  // Watch for theme changes and log (demonstrates watch())
  watch(
    () => settings.theme.value,
    (newTheme) => {
      console.log(`Theme changed to: ${newTheme}`);
    },
  );

  // ── Page layout with JSX ────────────────────────────

  return (
    <div class={settingsStyles.classNames.page} data-testid="settings-page">
      <h1 class={settingsStyles.classNames.title}>Settings</h1>

      <section class={settingsStyles.classNames.section}>
        <h2 class={settingsStyles.classNames.sectionTitle}>Appearance</h2>
        <div class={settingsStyles.classNames.themeGrid}>
          <div
            class={`${settingsStyles.classNames.themeCard} ${
              currentTheme === 'light'
                ? settingsStyles.classNames.themeCardActive
                : settingsStyles.classNames.themeCardInactive
            }`}
            data-testid="theme-light"
            role="button"
            tabindex="0"
            onClick={() => selectTheme('light')}
          >
            <div class={settingsStyles.classNames.previewBox} style="background-color: #ffffff">
              <div class={settingsStyles.classNames.previewText}>Light theme preview</div>
            </div>
            <div style="font-weight: 500">Light</div>
          </div>
          <div
            class={`${settingsStyles.classNames.themeCard} ${
              currentTheme === 'dark'
                ? settingsStyles.classNames.themeCardActive
                : settingsStyles.classNames.themeCardInactive
            }`}
            data-testid="theme-dark"
            role="button"
            tabindex="0"
            onClick={() => selectTheme('dark')}
          >
            <div class={settingsStyles.classNames.previewBox} style="background-color: #111827">
              <div class={settingsStyles.classNames.previewText}>Dark theme preview</div>
            </div>
            <div style="font-weight: 500">Dark</div>
          </div>
        </div>
        {showSaved && (
          <div class={settingsStyles.classNames.savedMsg} data-testid="saved-message">
            Settings saved!
          </div>
        )}
      </section>

      <section class={settingsStyles.classNames.section}>
        <h2 class={settingsStyles.classNames.sectionTitle}>Default Priority</h2>
        <div class={formStyles.classNames.formGroup}>
          <select
            class={formStyles.classNames.select}
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
