/**
 * Linear Clone — App root.
 *
 * Wires AuthProvider (OAuth session), RouterContext, and ThemeProvider.
 * SSR module exports: App, theme, styles, getInjectedCSS.
 */

import { getInjectedCSS, globalCss, RouterContext, RouterView, ThemeProvider } from '@vertz/ui';
import { AuthProvider } from '@vertz/ui/auth';
import { appRouter } from './router';
import { linearTheme, themeGlobals } from './styles/theme';

const appGlobals = globalCss({
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
});

// ── SSR module exports ─────────────────────────────────────

export { getInjectedCSS };
export const theme = linearTheme;
export const styles = [themeGlobals.css, appGlobals.css];

// ── App component ──────────────────────────────────────────

export function App() {
  return (
    <AuthProvider basePath="/api/auth">
      <RouterContext.Provider value={appRouter}>
        <ThemeProvider theme="dark">
          <RouterView router={appRouter} fallback={() => <div>Page not found</div>} />
        </ThemeProvider>
      </RouterContext.Provider>
    </AuthProvider>
  );
}
