/**
 * App shell — root component with sidebar navigation and theme switching.
 *
 * Demonstrates:
 * - ThemeProvider for theme context (CSS variable scoping)
 * - createContext / useContext for app-wide settings
 * - RouterContext + RouterView for declarative route rendering
 * - @vertz/theme-shadcn for pre-built styles via configureTheme()
 *
 * Uses pure JSX — the compiler wraps component children in thunks,
 * ensuring elements are created top-down for hydration compatibility.
 */

import { ListTodoIcon, MoonIcon, PlusCircleIcon, SettingsIcon, SunIcon } from '@vertz/icons';
import {
  RouterContext,
  RouterView,
  ThemeProvider,
  css,
  getInjectedCSS,
  globalCss,
  token,
} from '@vertz/ui';
import { createSettingsValue, SettingsContext, useSettings } from './lib/settings-context';
import { appRouter, Link } from './router';
import { layoutStyles } from './styles/components';
import { taskManagerTheme, themeGlobals } from './styles/theme';

const navStyles = css({
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': { color: token.color.foreground },
  },
  navList: { display: 'flex', flexDirection: 'column', gap: token.spacing[1] },
  navTitle: {
    fontSize: token.font.size.lg,
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
    marginBottom: token.spacing[6],
  },
  themeToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer',
    marginTop: 'auto',
    paddingTop: token.spacing[4],
    borderTopWidth: '1px',
    borderColor: token.color.border,
    '&:hover': { color: token.color.foreground },
  },
});

// ── App-specific global styles (extends theme globals) ─────

const appGlobals = globalCss({
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
});

// ── SSR module exports ─────────────────────────────────────

export { getInjectedCSS };
export const theme = taskManagerTheme;
export const styles = [themeGlobals.css, appGlobals.css];

// ── Sidebar with theme toggle ────────────────────────────────

function Sidebar() {
  const settings = useSettings();

  function toggleTheme() {
    const next = settings.theme === 'light' ? 'dark' : 'light';
    settings.setTheme(next);
  }

  return (
    <nav
      className={layoutStyles.sidebar}
      aria-label="Main navigation"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <div className={navStyles.navTitle}>Task Manager</div>
      <div className={navStyles.navList}>
        <div className={navStyles.navItem}>
          <ListTodoIcon size={16} />
          <Link href="/" activeClass="font-bold">
            All Tasks
          </Link>
        </div>
        <div className={navStyles.navItem}>
          <PlusCircleIcon size={16} />
          <Link href="/tasks/new" activeClass="font-bold">
            Create Task
          </Link>
        </div>
        <div className={navStyles.navItem}>
          <SettingsIcon size={16} />
          <Link href="/settings" activeClass="font-bold">
            Settings
          </Link>
        </div>
      </div>
      <div
        className={navStyles.themeToggle}
        role="button"
        tabindex="0"
        data-testid="theme-toggle"
        onClick={toggleTheme}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleTheme();
          }
        }}
      >
        {settings.theme === 'light' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
        {settings.theme === 'light' ? 'Dark Mode' : 'Light Mode'}
      </div>
    </nav>
  );
}

// ── App component ──────────────────────────────────────────

/**
 * Create the root app element.
 *
 * The app is wrapped in:
 * 1. SettingsContext.Provider — for app-wide settings access
 * 2. RouterContext.Provider — for router access via useRouter()
 * 3. ThemeProvider — for CSS custom property switching
 */
export function App() {
  const settings = createSettingsValue();

  return (
    <div data-testid="app-root">
      <SettingsContext.Provider value={settings}>
        <RouterContext.Provider value={appRouter}>
          <ThemeProvider theme={settings.theme.peek()}>
            <div className={layoutStyles.shell}>
              <Sidebar />
              <main className={layoutStyles.main} data-testid="main-content">
                <RouterView
                  router={appRouter}
                  fallback={() => <div data-testid="not-found">Page not found</div>}
                />
              </main>
            </div>
          </ThemeProvider>
        </RouterContext.Provider>
      </SettingsContext.Provider>
    </div>
  );
}
