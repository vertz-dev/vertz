/**
 * Settings page — theme switching and default preferences.
 *
 * Demonstrates:
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

  const page = document.createElement('div');
  page.className = settingsStyles.classNames.page;
  page.setAttribute('data-testid', 'settings-page');

  const title = document.createElement('h1');
  title.className = settingsStyles.classNames.title;
  title.textContent = 'Settings';
  page.appendChild(title);

  // ── Theme section ──────────────────────────────────

  const themeSection = document.createElement('section');
  themeSection.className = settingsStyles.classNames.section;

  const themeSectionTitle = document.createElement('h2');
  themeSectionTitle.className = settingsStyles.classNames.sectionTitle;
  themeSectionTitle.textContent = 'Appearance';
  themeSection.appendChild(themeSectionTitle);

  const themeGrid = document.createElement('div');
  themeGrid.className = settingsStyles.classNames.themeGrid;

  // Light theme card
  const lightCard = document.createElement('div');
  lightCard.setAttribute('data-testid', 'theme-light');
  lightCard.setAttribute('role', 'button');
  lightCard.setAttribute('tabindex', '0');

  // Light preview using ThemeProvider
  const lightPreview = ThemeProvider({
    theme: 'light',
    children: [createPreviewContent('Light')],
  });
  lightPreview.className = settingsStyles.classNames.previewBox;
  lightPreview.style.backgroundColor = '#ffffff';
  lightCard.appendChild(lightPreview);

  const lightLabel = document.createElement('div');
  lightLabel.textContent = 'Light';
  lightLabel.style.fontWeight = '500';
  lightCard.appendChild(lightLabel);

  lightCard.addEventListener('click', () => {
    settings.setTheme('light');
    flashSaved();
  });

  // Dark theme card
  const darkCard = document.createElement('div');
  darkCard.setAttribute('data-testid', 'theme-dark');
  darkCard.setAttribute('role', 'button');
  darkCard.setAttribute('tabindex', '0');

  const darkPreview = ThemeProvider({
    theme: 'dark',
    children: [createPreviewContent('Dark')],
  });
  darkPreview.className = settingsStyles.classNames.previewBox;
  darkPreview.style.backgroundColor = '#111827';
  darkCard.appendChild(darkPreview);

  const darkLabel = document.createElement('div');
  darkLabel.textContent = 'Dark';
  darkLabel.style.fontWeight = '500';
  darkCard.appendChild(darkLabel);

  darkCard.addEventListener('click', () => {
    settings.setTheme('dark');
    flashSaved();
  });

  themeGrid.appendChild(lightCard);
  themeGrid.appendChild(darkCard);
  themeSection.appendChild(themeGrid);

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

  // Saved confirmation message
  const savedMsg = document.createElement('div');
  savedMsg.className = settingsStyles.classNames.savedMsg;
  savedMsg.textContent = 'Settings saved!';
  savedMsg.style.display = 'none';
  savedMsg.setAttribute('data-testid', 'saved-message');
  themeSection.appendChild(savedMsg);

  effect(() => {
    savedMsg.style.display = showSaved.value ? 'block' : 'none';
  });

  page.appendChild(themeSection);

  // ── Default Priority section ───────────────────────

  const prioritySection = document.createElement('section');
  prioritySection.className = settingsStyles.classNames.section;

  const prioritySectionTitle = document.createElement('h2');
  prioritySectionTitle.className = settingsStyles.classNames.sectionTitle;
  prioritySectionTitle.textContent = 'Default Priority';
  prioritySection.appendChild(prioritySectionTitle);

  const priorityGroup = document.createElement('div');
  priorityGroup.className = formStyles.classNames.formGroup;

  const prioritySelect = document.createElement('select');
  prioritySelect.className = formStyles.classNames.select;
  prioritySelect.setAttribute('data-testid', 'default-priority-select');

  for (const priority of ['low', 'medium', 'high', 'urgent'] as const) {
    const option = document.createElement('option');
    option.value = priority;
    option.textContent = priority.charAt(0).toUpperCase() + priority.slice(1);
    prioritySelect.appendChild(option);
  }

  // Sync select with current setting
  effect(() => {
    prioritySelect.value = settings.defaultPriority.value;
  });

  prioritySelect.addEventListener('change', () => {
    const value = prioritySelect.value as 'low' | 'medium' | 'high' | 'urgent';
    settings.setDefaultPriority(value);
    flashSaved();
  });

  priorityGroup.appendChild(prioritySelect);
  prioritySection.appendChild(priorityGroup);
  page.appendChild(prioritySection);

  // Watch for theme changes and log (demonstrates watch())
  watch(
    () => settings.theme.value,
    (newTheme) => {
      console.log(`Theme changed to: ${newTheme}`);
    },
  );

  // ── Helpers ────────────────────────────────────────

  function flashSaved(): void {
    showSaved.value = true;
    setTimeout(() => {
      showSaved.value = false;
    }, 2000);
  }

  return page;
}

/** Create a small preview box showing the theme's look. */
function createPreviewContent(label: string): HTMLElement {
  const el = document.createElement('div');
  el.className = settingsStyles.classNames.previewText;
  el.textContent = `${label} theme preview`;
  return el;
}
