/**
 * App shell — root component for the Entity Todo app.
 *
 * Demonstrates:
 * - SettingsContext for app-wide theme preference
 * - ThemeProvider for CSS variable scoping (light/dark)
 * - App header with dark mode toggle
 * - Minimal app shell without router (single page)
 */

import { css, getInjectedCSS, globalCss, ThemeProvider } from '@vertz/ui';
import { createSettingsValue, SettingsContext, useSettings } from './lib/settings-context';
import { TodoListPage } from './pages/todo-list';
import { layoutStyles } from './styles/components';
import { themeGlobals, todoTheme } from './styles/theme';

// ── App-specific global styles (extends theme globals) ─────

const appGlobals = globalCss({
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
});

const headerStyles = css({
  title: ['font:lg', 'font:bold', 'text:foreground'],
  subtitle: ['text:xs', 'text:muted-foreground'],
  themeToggle: [
    'inline-flex',
    'items:center',
    'justify:center',
    'rounded:md',
    'w:9',
    'h:9',
    'text:muted-foreground',
    'hover:text:foreground',
    'hover:bg:accent',
    'transition:colors',
    'cursor:pointer',
    'border:1',
    'border:border',
  ],
});

// ── SSR module exports ─────────────────────────────────────

export { getInjectedCSS };
export const theme = todoTheme;
export const styles = [themeGlobals.css, appGlobals.css];

// ── App header with theme toggle ────────────────────────────

function AppHeader() {
  const settings = useSettings();
  let currentTheme = settings.theme.peek();

  function toggleTheme() {
    const next = currentTheme === 'light' ? 'dark' : 'light';
    currentTheme = next;
    settings.setTheme(next);
  }

  return (
    <header class={layoutStyles.header}>
      <div>
        <div class={headerStyles.title}>Entity Todo</div>
        <span class={headerStyles.subtitle}>schema → entity → SDK → UI → SSR</span>
      </div>
      <button
        type="button"
        class={headerStyles.themeToggle}
        data-testid="theme-toggle"
        aria-label={currentTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        onClick={toggleTheme}
      >
        {currentTheme === 'light' ? '☽' : '☀'}
      </button>
    </header>
  );
}

// ── App component ──────────────────────────────────────────

export function App() {
  const settings = createSettingsValue();

  return (
    <div data-testid="app-root">
      <SettingsContext.Provider value={settings}>
        <ThemeProvider theme={settings.theme.peek()}>
          <div class={layoutStyles.shell}>
            <AppHeader />
            <main class={layoutStyles.main}>
              <TodoListPage />
            </main>
          </div>
        </ThemeProvider>
      </SettingsContext.Provider>
    </div>
  );
}
