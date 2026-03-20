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
  createDialogStack,
  DialogStackContext,
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

  // Dialog container: During SSR, create a fresh div (DOM shim). On the client,
  // claim the existing SSR-rendered div by its data attribute — document.createElement
  // would produce a NEW detached div that __append skips during hydration (no-op),
  // leaving the dialog stack appending to a node not in the DOM.
  const dialogContainer = isBrowser()
    ? ((document.querySelector('[data-dialog-container]') as HTMLDivElement) ??
      document.createElement('div'))
    : document.createElement('div');
  dialogContainer.setAttribute('data-dialog-container', '');
  const dialogStack = createDialogStack(dialogContainer);

  return (
    <AuthProvider auth={api.auth}>
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
