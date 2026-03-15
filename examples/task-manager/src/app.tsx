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
  css,
  getInjectedCSS,
  globalCss,
  RouterContext,
  RouterView,
  ThemeProvider,
} from '@vertz/ui';
import { createSettingsValue, SettingsContext, useSettings } from './lib/settings-context';
import { appRouter, Link } from './router';
import { layoutStyles } from './styles/components';
import { taskManagerTheme, themeGlobals } from './styles/theme';

const navStyles = css({
  navItem: [
    'flex',
    'items:center',
    'gap:2',
    'text:sm',
    'text:muted-foreground',
    'hover:text:foreground',
    'transition:colors',
  ],
  navList: ['flex', 'flex-col', 'gap:1'],
  navTitle: ['font:lg', 'font:bold', 'text:foreground', 'mb:6'],
  themeToggle: [
    'flex',
    'items:center',
    'gap:2',
    'text:sm',
    'text:muted-foreground',
    'hover:text:foreground',
    'transition:colors',
    'cursor:pointer',
    'mt:auto',
    'pt:4',
    'border-t:1',
    'border:border',
  ],
});

// ── App-specific global styles (extends theme globals) ─────

const appGlobals = globalCss({
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
});

// ── View Transitions CSS ───────────────────────────────────────

const viewTransitionsCss = `
::view-transition-old(root) {
  animation: fade-out 120ms ease-in;
}
::view-transition-new(root) {
  animation: fade-in 200ms ease-out;
}
@keyframes fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
`;

// ── SSR module exports ─────────────────────────────────────

export { getInjectedCSS };
export const theme = taskManagerTheme;
export const styles = [themeGlobals.css, appGlobals.css, viewTransitionsCss];

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
      style="display: flex; flex-direction: column"
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
