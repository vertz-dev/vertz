/**
 * Client entry point for hydration.
 *
 * Takes the server-rendered HTML and hydrates it with client-side interactivity.
 */

import { globalCss } from '@vertz/ui';
import { App } from './app';
import { taskManagerTheme } from './styles/theme';

// ── Theme CSS injection ──────────────────────────────

function buildThemeCss(theme: typeof taskManagerTheme): string {
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
themeStyleEl.textContent = buildThemeCss(taskManagerTheme);
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
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
});

const globalStyleEl = document.createElement('style');
globalStyleEl.textContent = globalStyles.css;
document.head.appendChild(globalStyleEl);

// ── View Transitions CSS ─────────────────────────────

const viewTransitionEl = document.createElement('style');
viewTransitionEl.textContent = `
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
document.head.appendChild(viewTransitionEl);

// ── Hydration ────────────────────────────────────────

// For now, we'll replace the server-rendered content with the client app
// In a full hydration setup, we would preserve the DOM and just attach event handlers
const appContainer = document.getElementById('app');
if (appContainer) {
  // Clear server-rendered content and mount client app
  appContainer.innerHTML = '';
  const app = App();
  appContainer.appendChild(app);
  console.log('Task Manager app hydrated');
} else {
  console.error('App container not found');
}
