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
  __append,
  __element,
  __enterChildren,
  __exitChildren,
  __staticText,
  css,
  RouterContext,
  RouterView,
  ThemeProvider,
} from '@vertz/ui';
import { createSettingsValue, SettingsContext } from './lib/settings-context';
import { appRouter, Link } from './router';
import { layoutStyles } from './styles/components';

const navStyles = css({
  navItem: ['text:sm', 'text:muted', 'hover:text:foreground', 'transition:colors'],
  navList: ['flex', 'flex-col', 'gap:1'],
  navTitle: ['font:lg', 'font:bold', 'text:foreground', 'mb:6'],
});

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
                  fallback={() => {
                    const fb = __element('div', { 'data-testid': 'not-found' });
                    __enterChildren(fb);
                    __append(fb, __staticText('Page not found'));
                    __exitChildren();
                    return fb;
                  }}
                />
              </main>
            </div>
          </ThemeProvider>
        </RouterContext.Provider>
      </SettingsContext.Provider>
    </div>
  );
}
