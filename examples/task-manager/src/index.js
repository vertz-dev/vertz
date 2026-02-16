/**
 * Entry point for the Task Manager demo app.
 *
 * Exports App for SSR and mounts it on the client.
 * With zero-config SSR (`ssr: true` in vite.config.ts), the framework
 * auto-detects this entry from index.html and calls the default export
 * during server rendering.
 */
import { globalCss } from '@vertz/ui';
import { App } from './app';
import { taskManagerTheme } from './styles/theme';
// Re-export App as default for SSR entry auto-detection
export { App };
export default App;
// ── Client-side initialization (skipped during SSR) ──
const isSSR = typeof globalThis.__SSR_URL__ !== 'undefined';
if (!isSSR) {
    // ── Theme CSS injection ──────────────────────────────
    function buildThemeCss(theme) {
        const rootVars = [];
        const darkVars = [];
        for (const [name, values] of Object.entries(theme.colors)) {
            for (const [key, value] of Object.entries(values)) {
                if (key === 'DEFAULT') {
                    rootVars.push(`  --color-${name}: ${value};`);
                }
                else if (key === '_dark') {
                    darkVars.push(`  --color-${name}: ${value};`);
                }
                else {
                    rootVars.push(`  --color-${name}-${key}: ${value};`);
                }
            }
        }
        if (theme.spacing) {
            for (const [name, value] of Object.entries(theme.spacing)) {
                rootVars.push(`  --spacing-${name}: ${value};`);
            }
        }
        const blocks = [];
        if (rootVars.length > 0)
            blocks.push(`:root {\n${rootVars.join('\n')}\n}`);
        if (darkVars.length > 0)
            blocks.push(`[data-theme="dark"] {\n${darkVars.join('\n')}\n}`);
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
    const root = document.getElementById('app');
    if (root) {
        // If SSR HTML is present, clear and remount (true hydration is Phase 2)
        if (root.hasChildNodes()) {
            root.innerHTML = '';
        }
        root.appendChild(app);
    }
    console.log('Task Manager app mounted');
}
//# sourceMappingURL=index.js.map