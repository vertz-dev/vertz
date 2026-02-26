/**
 * App shell — root component for the Entity Todo demo.
 *
 * Demonstrates:
 * - JSX for layout composition
 * - ThemeProvider for theme context
 * - Minimal app shell without router
 *
 * Also serves as the SSRModule entry: exports App, theme, styles, getInjectedCSS.
 */

import { getInjectedCSS, ThemeProvider } from '@vertz/ui';
import { TodoListPage } from './pages/todo-list';
import { globalStyles } from './styles/global';
import { todoTheme } from './styles/theme';

export function App() {
  const content = TodoListPage();

  const container = <div data-testid="app-root">{content}</div>;

  const themeWrapper = ThemeProvider({
    theme: 'light',
    children: [container],
  });

  return themeWrapper;
}

// SSRModule exports
export { getInjectedCSS };
export const theme = todoTheme;
export const styles = [globalStyles.css];
