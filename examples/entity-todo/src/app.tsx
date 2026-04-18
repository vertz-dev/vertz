/**
 * App shell — root component for the Entity Todo app.
 *
 * Demonstrates:
 * - SettingsContext for app-wide theme preference
 * - ThemeProvider for CSS variable scoping (light/dark)
 * - App header with dark mode toggle
 * - Minimal app shell without router (single page)
 */

import {
  DialogStackProvider,
  ThemeProvider,
  css,
  getInjectedCSS,
  globalCss,
  token,
  useContext,
} from '@vertz/ui';
import { createSettingsValue, SettingsContext } from './lib/settings-context';
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
  title: {
    fontSize: token.font.size.lg,
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
  },
  subtitle: { fontSize: token.font.size.xs, color: token.color['muted-foreground'] },
  themeToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: token.radius.md,
    width: token.spacing[9],
    height: token.spacing[9],
    backgroundColor: 'transparent',
    color: token.color['muted-foreground'],
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer',
    borderWidth: '1px',
    borderColor: token.color.border,
    '&:hover': { color: token.color.foreground, backgroundColor: token.color.accent },
  },
});

// ── SSR module exports ─────────────────────────────────────

export { getInjectedCSS };
export const theme = todoTheme;
export const styles = [themeGlobals.css, appGlobals.css];

// ── App header with theme toggle ────────────────────────────

function AppHeader() {
  const settings = useContext(SettingsContext)!;

  function toggleTheme() {
    const next = settings.theme === 'light' ? 'dark' : 'light';
    settings.setTheme(next);
  }

  return (
    <header className={layoutStyles.header}>
      <div>
        <div className={headerStyles.title}>Entity Todo</div>
        <span className={headerStyles.subtitle}>schema → entity → SDK → UI → SSR</span>
      </div>
      <button
        type="button"
        className={headerStyles.themeToggle}
        data-testid="theme-toggle"
        aria-label={settings.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        onClick={toggleTheme}
      >
        {settings.theme === 'light' ? '☽' : '☀'}
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
          <DialogStackProvider>
            <div className={layoutStyles.shell}>
              <AppHeader />
              <main className={layoutStyles.main}>
                <TodoListPage />
              </main>
            </div>
          </DialogStackProvider>
        </ThemeProvider>
      </SettingsContext.Provider>
    </div>
  );
}
