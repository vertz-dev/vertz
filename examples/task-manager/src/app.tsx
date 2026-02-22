/**
 * App shell — root component with sidebar navigation and theme switching.
 *
 * Demonstrates:
 * - JSX for layout composition
 * - ThemeProvider for theme context (CSS variable scoping)
 * - createContext / useContext for app-wide settings
 * - watch() for reacting to external signals (route changes, theme changes)
 * - Full composition of all @vertz/ui features
 */

import { css, ThemeProvider, watch } from '@vertz/ui';
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
    // Main content area — updated by the route watch callback
    const main = <main class={layoutStyles.classNames.main} data-testid="main-content" />;

    // Shell layout: sidebar + main, composed with JSX
    const shell = (
      <div class={layoutStyles.classNames.shell}>
        <nav class={layoutStyles.classNames.sidebar} aria-label="Main navigation">
          <div class={navStyles.classNames.navTitle}>Task Manager</div>
          <div class={navStyles.classNames.navList}>
            <Link
              href="/"
              children="All Tasks"
              activeClass="font-bold"
              className={navStyles.classNames.navItem}
            />
            <Link
              href="/tasks/new"
              children="Create Task"
              activeClass="font-bold"
              className={navStyles.classNames.navItem}
            />
            <Link
              href="/settings"
              children="Settings"
              activeClass="font-bold"
              className={navStyles.classNames.navItem}
            />
          </div>
        </nav>
        {main}
      </div>
    );

    // ── Reactive route rendering with page transitions ──

    /** Swap main content, using the View Transitions API when available. */
    function updateContent(node: Node) {
      const swap = () => {
        main.innerHTML = '';
        main.appendChild(node);
      };

      if (typeof document !== 'undefined' && 'startViewTransition' in document) {
        (document as any).startViewTransition(swap);
      } else {
        swap();
      }
    }

    watch(
      () => appRouter.current.value,
      (match) => {
        if (!match) {
          updateContent(<div data-testid="not-found">Page not found</div>);
          return;
        }

        // Render the matched route's component
        const component = match.route.component();
        if (component instanceof Promise) {
          component.then((mod) => {
            const node = (mod as { default: () => Node }).default();
            updateContent(node);
          });
        } else {
          updateContent(component);
        }
      },
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

  return container as HTMLElement;
}
