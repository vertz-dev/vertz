/**
 * Entry point for the Entity Todo demo app.
 *
 * Exports App for SSR and mounts it on the client.
 */

import { mount, globalCss } from '@vertz/ui';
import { App } from './app';
import { todoTheme } from './styles/theme';

// Re-export App as default for SSR entry auto-detection
export { App };
export default App;

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
});

// ── Mount ──────────────────────────────────────────────────────

mount(App, '#app', {
  theme: todoTheme,
  styles: [globalStyles.css],
});

console.log('Entity Todo app mounted');
