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
  ANIMATION_DURATION,
  ANIMATION_EASING,
  DialogStackProvider,
  fadeOut,
  getInjectedCSS,
  globalCss,
  isBrowser,
  RouterContext,
  RouterView,
  slideInFromTop,
  ThemeProvider,
  zoomIn,
  zoomOut,
} from '@vertz/ui';
import { AuthProvider } from '@vertz/ui/auth';
import { api } from './api/client';
import { appRouter } from './router';
import { linearTheme, themeGlobals } from './styles/theme';

const appGlobals = globalCss({
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
});

// ── Presence animation globals ─────────────────────────────
// ListTransition and Presence set data-presence="enter"/"exit" on elements.
// These rules drive the CSS animations for those states.

void globalCss({
  '[data-presence="enter"]': {
    animation: `${slideInFromTop} ${ANIMATION_DURATION} ${ANIMATION_EASING}`,
  },
  '[data-presence="exit"]': {
    animation: `${fadeOut} ${ANIMATION_DURATION} ${ANIMATION_EASING}`,
  },
  '[data-dialog-presence="enter"]': {
    animation: `${zoomIn} 200ms ${ANIMATION_EASING}`,
  },
  '[data-dialog-presence="exit"]': {
    animation: `${zoomOut} 150ms ${ANIMATION_EASING}`,
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

  return (
    <AuthProvider auth={api.auth}>
      <RouterContext.Provider value={appRouter}>
        <ThemeProvider theme="dark">
          <DialogStackProvider>
            <RouterView router={appRouter} fallback={() => <div>Page not found</div>} />
          </DialogStackProvider>
        </ThemeProvider>
      </RouterContext.Provider>
    </AuthProvider>
  );
}
