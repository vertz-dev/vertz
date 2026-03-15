/**
 * Linear Clone — App root.
 *
 * Wires AuthProvider (OAuth session), RouterContext, and ThemeProvider.
 * SSR module exports: App, theme, styles, getInjectedCSS.
 *
 * Dark mode is always on — set via data-theme="dark" on <html> so that
 * body-level styles (background, foreground, font) resolve to dark tokens.
 */

import {
  createDialogStack,
  DialogStackContext,
  getInjectedCSS,
  globalCss,
  isBrowser,
  RouterContext,
  RouterView,
  ThemeProvider,
} from '@vertz/ui';
import { AuthProvider } from '@vertz/ui/auth';
import { appRouter } from './router';
import { linearTheme, themeGlobals } from './styles/theme';

const appGlobals = globalCss({
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

// ── SSR module exports ─────────────────────────────────────

export { getInjectedCSS };
export const theme = linearTheme;
export const styles = [themeGlobals.css, appGlobals.css, viewTransitionsCss];

// ── App component ──────────────────────────────────────────

export function App() {
  // Ensure <html> has data-theme="dark" on client mount so body-level
  // CSS variables (background, foreground, font) resolve to dark tokens.
  if (isBrowser()) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  // Use document.createElement instead of JSX (<div />) because JSX compiles
  // to __element('div') which claims SSR nodes during hydration. This container
  // is created before the JSX tree, so it would steal ThemeProvider's <div>.
  const dialogContainer = document.createElement('div');
  const dialogStack = createDialogStack(dialogContainer);

  return (
    <AuthProvider basePath="/api/auth">
      <RouterContext.Provider value={appRouter}>
        <ThemeProvider theme="dark">
          <DialogStackContext.Provider value={dialogStack}>
            {/* biome-ignore lint/complexity/noUselessFragments: Provider requires single root */}
            <>
              <RouterView router={appRouter} fallback={() => <div>Page not found</div>} />
              {dialogContainer}
            </>
          </DialogStackContext.Provider>
        </ThemeProvider>
      </RouterContext.Provider>
    </AuthProvider>
  );
}
