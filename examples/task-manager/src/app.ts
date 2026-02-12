/**
 * App shell — root component with sidebar navigation and theme switching.
 *
 * Demonstrates:
 * - ThemeProvider for theme context
 * - createContext / useContext for app-wide settings
 * - effect() for reactive route rendering
 * - Full composition of all @vertz/ui features
 */

import { ThemeProvider, css, effect } from '@vertz/ui';
import {
  SettingsContext,
  createSettingsValue,
} from './lib/settings-context';
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
export function App(): HTMLElement {
  const settings = createSettingsValue();

  // The outer container — will be returned
  const container = document.createElement('div');
  container.setAttribute('data-testid', 'app-root');

  // We wrap the render in the SettingsContext.Provider scope
  SettingsContext.Provider(settings, () => {
    // Shell layout: sidebar + main
    const shell = document.createElement('div');
    shell.className = layoutStyles.classNames.shell;

    // ── Sidebar ─────────────────────────────────────

    const sidebar = document.createElement('nav');
    sidebar.className = layoutStyles.classNames.sidebar;
    sidebar.setAttribute('aria-label', 'Main navigation');

    const logo = document.createElement('div');
    logo.className = navStyles.classNames.navTitle;
    logo.textContent = 'Task Manager';
    sidebar.appendChild(logo);

    const navList = document.createElement('div');
    navList.className = navStyles.classNames.navList;

    // Navigation links using the Link component factory
    const homeLink = Link({
      href: '/',
      children: 'All Tasks',
      activeClass: 'font-bold',
      className: navStyles.classNames.navItem,
    });

    const newTaskLink = Link({
      href: '/tasks/new',
      children: 'Create Task',
      activeClass: 'font-bold',
      className: navStyles.classNames.navItem,
    });

    const settingsLink = Link({
      href: '/settings',
      children: 'Settings',
      activeClass: 'font-bold',
      className: navStyles.classNames.navItem,
    });

    navList.appendChild(homeLink);
    navList.appendChild(newTaskLink);
    navList.appendChild(settingsLink);
    sidebar.appendChild(navList);

    // ── Main content area ───────────────────────────

    const main = document.createElement('main');
    main.className = layoutStyles.classNames.main;
    main.setAttribute('data-testid', 'main-content');

    shell.appendChild(sidebar);
    shell.appendChild(main);

    // ── Reactive route rendering ────────────────────

    effect(() => {
      const match = appRouter.current.value;

      // Clear the main area
      main.innerHTML = '';

      if (!match) {
        const notFound = document.createElement('div');
        notFound.textContent = 'Page not found';
        notFound.setAttribute('data-testid', 'not-found');
        main.appendChild(notFound);
        return;
      }

      // Render the matched route's component
      const component = match.route.component();
      if (component instanceof Promise) {
        // Handle async components
        component.then((mod) => {
          const node = (mod as { default: () => Node }).default();
          main.appendChild(node);
        });
      } else {
        main.appendChild(component);
      }
    });

    // Wrap in ThemeProvider with reactive theme
    let currentThemeWrapper = ThemeProvider({
      theme: settings.theme.peek(),
      children: [shell],
    });
    container.appendChild(currentThemeWrapper);

    // Re-wrap when theme changes (ThemeProvider sets data-theme attribute)
    effect(() => {
      const theme = settings.theme.value;
      currentThemeWrapper.setAttribute('data-theme', theme);
    });
  });

  return container;
}
