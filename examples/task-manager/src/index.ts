/**
 * Entry point for the Task Manager demo app.
 *
 * Exports App for SSR and mounts it on the client.
 * The SSR dev server imports this module server-side and calls the
 * default export during server rendering.
 */

import { getInjectedCSS, globalCss, mount } from '@vertz/ui';
import { App } from './app';
import { taskManagerTheme } from './styles/theme';

// HMR self-accept — prevents Bun from triggering full page reloads when
// @vertz/ui dist chunks are included in HMR updates (false positives from
// Bun's file watcher). Component-level Fast Refresh handles actual changes.
import.meta.hot.accept();

// Re-export App as default for SSR entry auto-detection
export { App };
export default App;

// Export theme for SSR — the virtual SSR entry compiles this into CSS
// custom properties (--color-*, --spacing-*) and injects them during rendering.
export { taskManagerTheme as theme };

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

// Export global styles for SSR — included in every SSR response
// so the page renders with correct typography, spacing, and colors
// before JS loads. Without this, the SSR HTML lacks body/reset styles.
export const styles = [globalStyles.css, viewTransitionsCss];

// Export CSS collection for SSR.
// The SSR build bundles @vertz/ui into the server bundle, creating
// a separate module instance from the one @vertz/ui-server depends on.
// Exporting getInjectedCSS lets @vertz/ui-server collect CSS from the
// same Set that component-level css() calls write to.
export { getInjectedCSS };

// ── Mount (client-only) ─────────────────────────────────────────
// During SSR, the virtual entry imports this module to call App().
// Guard mount() so it only runs in a real browser, not under the DOM shim
// or production SSR (where document doesn't exist at import time).
// biome-ignore lint/suspicious/noExplicitAny: SSR global check
const hasSSRUrl = typeof (globalThis as any).__SSR_URL__ !== 'undefined';
const isSSR = hasSSRUrl || typeof document === 'undefined';
if (!isSSR) {
  mount(App, '#app', {
    theme: taskManagerTheme,
    styles: [globalStyles.css, viewTransitionsCss],
  });
}
