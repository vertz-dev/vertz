/**
 * Entry point for the Task Manager demo app.
 *
 * Mounts the App component and injects global theme CSS.
 * In a real vertz app, the compiler would handle CSS injection.
 *
 * NOTE: compileTheme() is currently only available from internals.
 * This is noted as gotcha G1 in the DX Journal — developers need to
 * call compileTheme() to get CSS from defineTheme(), but it's not
 * part of the public API. For this demo we import from the CSS module.
 */

import { globalCss } from '@vertz/ui';
import { App } from './app';
import { taskManagerTheme } from './styles/theme';

// ── Theme CSS injection ──────────────────────────────

// In a real app, the compiler would handle theme compilation.
// For this demo, we manually build CSS custom properties from the theme definition.
// compileTheme() is an internal API — see DX Journal G1.
//
// Workaround: construct theme CSS manually from the defineTheme() output,
// which gives us access to the raw token data.
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

// ── Mount ────────────────────────────────────────────

const app = App();
document.getElementById('app')?.appendChild(app);

console.log('Task Manager app mounted');
