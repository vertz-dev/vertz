/**
 * App shell — root component with sidebar navigation and theme switching.
 *
 * Demonstrates:
 * - ThemeProvider for theme context (CSS variable scoping)
 * - createContext / useContext for app-wide settings
 * - RouterContext + RouterView for declarative route rendering
 * - Full composition of all @vertz/ui features
 *
 * The shell structure uses __element/__enterChildren/__exitChildren directly
 * (the same API the compiler generates for JSX) to ensure elements are created
 * in DOM tree order. This is required for hydration: the cursor-based walker
 * visits nodes top-down, so parent elements must be claimed before children.
 * JSX evaluation is bottom-up (children first), which breaks cursor tracking.
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
 * 2. ThemeProvider — for CSS custom property switching
 */
export function App() {
  const settings = createSettingsValue();

  // Build the shell top-down so hydration cursor claims nodes in DOM order.
  // container > ThemeProvider > shell > [nav, main > RouterView]
  const container = __element('div', { 'data-testid': 'app-root' });
  __enterChildren(container);

  SettingsContext.Provider(settings, () => {
    RouterContext.Provider(appRouter, () => {
      // ThemeProvider claims div[data-theme] — must be first child of container
      const themeWrapper = ThemeProvider({
        theme: settings.theme.peek(),
        children: [], // children built manually below
      });
      __append(container, themeWrapper);

      __enterChildren(themeWrapper);

      // Shell layout div
      const shell = __element('div', { class: layoutStyles.shell });
      __append(themeWrapper, shell);
      __enterChildren(shell);

      // Sidebar nav (first child of shell)
      const nav = __element('nav', {
        class: layoutStyles.sidebar,
        'aria-label': 'Main navigation',
      });
      __append(shell, nav);
      __enterChildren(nav);

      // Nav title
      const navTitle = __element('div', { class: navStyles.navTitle });
      __enterChildren(navTitle);
      __append(navTitle, __staticText('Task Manager'));
      __exitChildren();
      __append(nav, navTitle);

      // Nav list with links
      const navList = __element('div', { class: navStyles.navList });
      __enterChildren(navList);
      __append(
        navList,
        Link({
          href: '/',
          children: 'All Tasks',
          activeClass: 'font-bold',
          className: navStyles.navItem,
        }),
      );
      __append(
        navList,
        Link({
          href: '/tasks/new',
          children: 'Create Task',
          activeClass: 'font-bold',
          className: navStyles.navItem,
        }),
      );
      __append(
        navList,
        Link({
          href: '/settings',
          children: 'Settings',
          activeClass: 'font-bold',
          className: navStyles.navItem,
        }),
      );
      __exitChildren(); // navList
      __append(nav, navList);

      __exitChildren(); // nav

      // Main content area (second child of shell)
      const main = __element('main', {
        class: layoutStyles.main,
        'data-testid': 'main-content',
      });
      __append(shell, main);
      __enterChildren(main);

      // RouterView claims its container div inside main
      const routerView = RouterView({
        router: appRouter,
        fallback: () => {
          const fb = __element('div', { 'data-testid': 'not-found' });
          __enterChildren(fb);
          __append(fb, __staticText('Page not found'));
          __exitChildren();
          return fb;
        },
      });
      __append(main, routerView);

      __exitChildren(); // main
      __exitChildren(); // shell
      __exitChildren(); // themeWrapper
    });
  });

  __exitChildren(); // container
  return container;
}
