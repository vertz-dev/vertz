/**
 * App shell — root component with sidebar navigation and theme switching.
 *
 * Demonstrates:
 * - ThemeProvider for theme context (CSS variable scoping)
 * - createContext / useContext for app-wide settings
 * - RouterContext + RouterView for declarative route rendering
 * - Full composition of all @vertz/ui features
 *
 * Uses pure JSX — the compiler wraps component children in thunks,
 * ensuring elements are created top-down for hydration compatibility.
 */

import {
  css,
  getInjectedCSS,
  globalCss,
  RouterContext,
  RouterView,
  ThemeProvider,
} from '@vertz/ui';
import { createSettingsValue, SettingsContext } from './lib/settings-context';
import { appRouter, Link } from './router';
import { layoutStyles } from './styles/components';
import { taskManagerTheme } from './styles/theme';

const navStyles = css({
  navItem: ['text:sm', 'text:muted', 'hover:text:foreground', 'transition:colors'],
  navList: ['flex', 'flex-col', 'gap:1'],
  navTitle: ['font:lg', 'font:bold', 'text:foreground', 'mb:6'],
});

// ── Global reset styles ────────────────────────────────────────

const globalStyles = globalCss({
  '*, *::before, *::after': {
    boxSizing: 'border-box',
    margin: '0',
    padding: '0',
  },
  body: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-foreground)',
    minHeight: '100vh',
    lineHeight: '1.5',
  },
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

// ── SSR module exports ─────────────────────────────────────────

export { getInjectedCSS };
export const theme = taskManagerTheme;
export const styles = [globalStyles.css, viewTransitionsCss];

// ── App component ──────────────────────────────────────────────

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
            <div class={layoutStyles.shell}>
              <nav class={layoutStyles.sidebar} aria-label="Main navigation">
                <div class={navStyles.navTitle}>Task Manager</div>
                <div class={navStyles.navList}>
                  <Link href="/" activeClass="font-bold" className={navStyles.navItem}>
                    All Tasks
                  </Link>
                  <Link href="/tasks/new" activeClass="font-bold" className={navStyles.navItem}>
                    Create Task
                  </Link>
                  <Link href="/settings" activeClass="font-bold" className={navStyles.navItem}>
                    Settings
                  </Link>
                </div>
              </nav>
              <main class={layoutStyles.main} data-testid="main-content">
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
