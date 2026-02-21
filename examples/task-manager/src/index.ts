/**
 * Entry point for the Task Manager demo app.
 *
 * Exports App for SSR and mounts it on the client.
 * With zero-config SSR (`ssr: true` in vite.config.ts), the framework
 * auto-detects this entry from index.html and calls the default export
 * during server rendering.
 */

import { mount, globalCss } from '@vertz/ui';
import { App } from './app';
import { taskManagerTheme } from './styles/theme';

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

// ── Mount ──────────────────────────────────────────────────────

mount(App, '#app', {
  theme: taskManagerTheme,
  styles: [globalStyles.css, viewTransitionsCss],
});

console.log('Task Manager app mounted');
