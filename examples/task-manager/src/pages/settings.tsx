/**
 * Settings page — theme switching and default preferences.
 *
 * Demonstrates:
 * - JSX for settings layout with theme cards
 * - useContext() to consume the SettingsContext
 * - signal() for local form state
 * - effect() for reactive theme application
 * - watch() to observe theme changes
 * - ThemeProvider for live theme preview
 */

import { ThemeProvider, css, effect, signal, watch } from '@vertz/ui';
import { useSettings } from '../lib/settings-context';
import { button, formStyles } from '../styles/components';

const settingsStyles = css({
  page: ['max-w:lg', 'mx:auto'],
  title: ['font:2xl', 'font:bold', 'text:foreground', 'mb:6'],
  section: ['mb:8'],
  sectionTitle: ['font:lg', 'font:semibold', 'text:foreground', 'mb:4'],
  themeGrid: ['grid', 'grid-cols:2', 'gap:4'],
  themeCard: [
    'p:4',
    'rounded:lg',
    'border:2',
    'cursor:pointer',
    'transition:all',
  ],
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
export function SettingsPage(_props: SettingsPageProps): HTMLElement {
  const settings = useSettings();
  const showSaved = signal(false);

  function flashSaved(): void {
    showSaved.value = true;
    setTimeout(() => {
      showSaved.value = false;
    }, 2000);
  }

  // ── Theme preview using ThemeProvider (imperative — sets custom properties) ──

  const lightPreview = ThemeProvider({
    theme: 'light',
    children: [<div class={settingsStyles.classNames.previewText}>Light theme preview</div> as HTMLElement],
  });
  lightPreview.className = settingsStyles.classNames.previewBox;
  lightPreview.style.backgroundColor = '#ffffff';

  const darkPreview = ThemeProvider({
    theme: 'dark',
    children: [<div class={settingsStyles.classNames.previewText}>Dark theme preview</div> as HTMLElement],
  });
  darkPreview.className = settingsStyles.classNames.previewBox;
  darkPreview.style.backgroundColor = '#111827';

  // ── Theme cards with JSX ────────────────────────────

  const lightCard = (
    <div
      data-testid="theme-light"
      role="button"
      tabindex="0"
      onClick={() => { settings.setTheme('light'); flashSaved(); }}
    >
      {lightPreview}
      <div style="font-weight: 500">Light</div>
    </div>
  ) as HTMLElement;

  const darkCard = (
    <div
      data-testid="theme-dark"
      role="button"
      tabindex="0"
      onClick={() => { settings.setTheme('dark'); flashSaved(); }}
    >
      {darkPreview}
      <div style="font-weight: 500">Dark</div>
    </div>
  ) as HTMLElement;

  // Reactive active state for theme cards
  effect(() => {
    const current = settings.theme.value;
    lightCard.className = `${settingsStyles.classNames.themeCard} ${
      current === 'light'
        ? settingsStyles.classNames.themeCardActive
        : settingsStyles.classNames.themeCardInactive
    }`;
    darkCard.className = `${settingsStyles.classNames.themeCard} ${
      current === 'dark'
        ? settingsStyles.classNames.themeCardActive
        : settingsStyles.classNames.themeCardInactive
    }`;
  });

  // ── Saved confirmation message ──────────────────────

  const savedMsg = (
    <div class={settingsStyles.classNames.savedMsg} data-testid="saved-message" style="display: none">
      Settings saved!
    </div>
  ) as HTMLElement;

  effect(() => {
    savedMsg.style.display = showSaved.value ? 'block' : 'none';
  });

  // ── Priority select ─────────────────────────────────

  const prioritySelect = (
    <select class={formStyles.classNames.select} data-testid="default-priority-select">
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
      <option value="urgent">Urgent</option>
    </select>
  ) as HTMLSelectElement;

  // Sync select with current setting
  effect(() => {
    prioritySelect.value = settings.defaultPriority.value;
  });

  prioritySelect.addEventListener('change', () => {
    const value = prioritySelect.value as 'low' | 'medium' | 'high' | 'urgent';
    settings.setDefaultPriority(value);
    flashSaved();
  });

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
          {lightCard}
          {darkCard}
        </div>
        {savedMsg}
      </section>

      <section class={settingsStyles.classNames.section}>
        <h2 class={settingsStyles.classNames.sectionTitle}>Default Priority</h2>
        <div class={formStyles.classNames.formGroup}>
          {prioritySelect}
        </div>
      </section>
    </div>
  ) as HTMLElement;
}
