/**
 * App shell — root component with sidebar navigation and theme switching.
 *
 * Demonstrates:
 * - JSX for layout composition
 * - ThemeProvider for theme context (CSS variable scoping)
 * - createContext / useContext for app-wide settings
 * - RouterContext + RouterView for declarative route rendering
 * - watch() for reacting to external signals (theme changes)
 * - Full composition of all @vertz/ui features
 */

import { css, RouterContext, RouterView, ThemeProvider, watch } from '@vertz/ui';
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
 * 2. ThemeProvider — for CSS custom property switching
 */
export function App() {
  const settings = createSettingsValue();

  const container = <div data-testid="app-root" />;

  // We wrap the render in the SettingsContext.Provider scope
  SettingsContext.Provider(settings, () => {
    RouterContext.Provider(appRouter, () => {
      // RouterView declaratively renders the matched route's component
      const routerView = RouterView({
        router: appRouter,
        fallback: () => <div data-testid="not-found">Page not found</div>,
      });

      const main = (
        <main class={layoutStyles.main} data-testid="main-content">
          {routerView}
        </main>
      );

      // Shell layout: sidebar + main, composed with JSX
      const shell = (
        <div class={layoutStyles.shell}>
          <nav class={layoutStyles.sidebar} aria-label="Main navigation">
            <div class={navStyles.navTitle}>Task Manager</div>
            <div class={navStyles.navList}>
              <Link
                href="/"
                children="All Tasks"
                activeClass="font-bold"
                className={navStyles.navItem}
              />
              <Link
                href="/tasks/new"
                children="Create Task"
                activeClass="font-bold"
                className={navStyles.navItem}
              />
              <Link
                href="/settings"
                children="Settings"
                activeClass="font-bold"
                className={navStyles.navItem}
              />
            </div>
          </nav>
          {main}
        </div>
      );

      // Wrap in ThemeProvider with reactive theme
      const themeWrapper = ThemeProvider({
        theme: settings.theme.peek(),
        children: [shell],
      });
      container.appendChild(themeWrapper);

      // Sync theme changes to the ThemeProvider wrapper (CSS variable scoping)
      watch(
        () => settings.theme.value,
        (theme) => {
          themeWrapper.setAttribute('data-theme', theme);
        },
      );
    });
  });

  return container as HTMLElement;
}
