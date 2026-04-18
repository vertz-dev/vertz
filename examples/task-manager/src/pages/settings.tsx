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
import { css, token, useContext } from '@vertz/ui';
import { SettingsContext } from '../lib/settings-context';
import { formStyles } from '../styles/components';

const settingsStyles = css({
  page: { maxWidth: '32rem', marginInline: 'auto' },
  title: {
    fontSize: token.font.size['2xl'],
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
    marginBottom: token.spacing[6],
  },
  section: { marginBottom: token.spacing[8] },
  sectionTitle: {
    fontSize: token.font.size.lg,
    fontWeight: token.font.weight.semibold,
    color: token.color.foreground,
    marginBottom: token.spacing[4],
  },
  themeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: token.spacing[4],
  },
  themeCard: {
    padding: token.spacing[4],
    borderRadius: token.radius.lg,
    borderWidth: '2px',
    cursor: 'pointer',
    transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  themeCardActive: { borderColor: token.color.primary },
  themeCardInactive: { borderColor: token.color.border },
  previewBox: {
    padding: token.spacing[3],
    borderRadius: token.radius.md,
    marginBottom: token.spacing[2],
  },
  previewText: { fontSize: token.font.size.sm },
  savedMsg: {
    fontSize: token.font.size.sm,
    color: token.color['accent-foreground'],
    marginTop: token.spacing[2],
  },
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
              style={{
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SunIcon size={24} />
            </div>
            <div style={{ fontWeight: '500' }}>Light</div>
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
              style={{
                backgroundColor: '#111827',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MoonIcon size={24} />
            </div>
            <div style={{ fontWeight: '500' }}>Dark</div>
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
            value={defaultPriority}
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
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </section>
    </div>
  );
}
