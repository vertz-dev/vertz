/**
 * App shell — root component for the Entity Todo demo.
 *
 * Demonstrates:
 * - JSX for layout composition
 * - ThemeProvider for theme context
 * - Minimal app shell without router
 */

import { ThemeProvider } from '@vertz/ui';
import { TodoListPage } from './pages/todo-list';

export function App(): HTMLElement {
  const content = TodoListPage();

  const container = (
    <div data-testid="app-root">
      {content}
    </div>
  );

  const themeWrapper = ThemeProvider({
    theme: 'light',
    children: [container],
  });

  return themeWrapper;
}
