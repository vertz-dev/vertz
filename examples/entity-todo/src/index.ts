/**
 * Entry point for the Entity Todo demo app.
 *
 * Exports App for SSR and mounts it on the client.
 */

import { globalCss } from '@vertz/ui';
import { App } from './app';
import { todoTheme } from './styles/theme';

// Re-export App as default for SSR entry auto-detection
export { App };
export default App;

// ── Client-side initialization (skipped during SSR) ──

const isSSR = typeof (globalThis as any).__SSR_URL__ !== 'undefined';

if (!isSSR) {
  // ── Theme CSS injection ──────────────────────────────

  function buildThemeCss(theme: typeof todoTheme): string {
    const rootVars: string[] = [];
    const darkVars: string[] = [];

    for (const [name, values] of Object.entries(theme.colors)) {
      for (const [key, value] of Object.entries(values)) {
        if (key === 'DEFAULT') {
          rootVars.push(`  --color-${name}: ${value};`);
        } else if (key === '_dark') {
          darkVars.push(`  --color-${name}: ${value};`);
        } else {
          rootVars.push(`  --color-${name}-${key}: ${value};`);
        }
      }
    }

    if (theme.spacing) {
      for (const [name, value] of Object.entries(theme.spacing)) {
        rootVars.push(`  --spacing-${name}: ${value};`);
      }
    }

    const blocks: string[] = [];
    if (rootVars.length > 0) blocks.push(`:root {\n${rootVars.join('\n')}\n}`);
    if (darkVars.length > 0) blocks.push(`[data-theme="dark"] {\n${darkVars.join('\n')}\n}`);
    return blocks.join('\n');
  }

  const themeStyleEl = document.createElement('style');
  themeStyleEl.textContent = buildThemeCss(todoTheme);
  document.head.appendChild(themeStyleEl);

  // ── Global reset styles ──────────────────────────────

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

  const globalStyleEl = document.createElement('style');
  globalStyleEl.textContent = globalStyles.css;
  document.head.appendChild(globalStyleEl);

  // ── Mount ────────────────────────────────────────────

  const app = App();
  const root = document.getElementById('app');

  if (root) {
    if (root.hasChildNodes()) {
      root.innerHTML = '';
    }
    root.appendChild(app);
  }

  console.log('Entity Todo app mounted');
}
