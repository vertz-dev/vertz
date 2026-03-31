import { getInjectedCSS, ThemeProvider } from '@vertz/ui';
import { createRouter, defineRoutes, RouterView } from '@vertz/ui/router';
import {
  applyAccent,
  applyPalette,
  applyRadius,
  getCustomizationCookie,
  setModuleState,
} from './hooks/use-customization';
import { getInitialTheme, useTheme } from './hooks/use-theme';
import { ComponentPage } from './pages/component-page';
import { IndexRedirect } from './pages/index-redirect';
import { OverviewPage } from './pages/overview-page';
import { appGlobals } from './styles/globals';
import { docsTheme, themeGlobals } from './styles/theme';

// ── SSR module exports ─────────────────────────────────────
export { getInjectedCSS };
export { getInitialTheme } from './hooks/use-theme';
export const theme = docsTheme;
export const styles = [themeGlobals.css, appGlobals.css];

// ── Routes ─────────────────────────────────────────────────
const routes = defineRoutes({
  '/': {
    component: () => <IndexRedirect />,
  },
  '/overview': {
    component: () => <OverviewPage />,
  },
  '/components/:name': {
    component: () => <ComponentPage />,
  },
});

const router = createRouter(routes);

// ── App component ──────────────────────────────────────────
export function App() {
  const { theme: currentTheme } = useTheme();

  // Restore saved customization on mount
  if (typeof document !== 'undefined') {
    const saved = getCustomizationCookie();
    if (saved) {
      setModuleState(saved);
      queueMicrotask(() => {
        if (saved.palette !== 'zinc') applyPalette(saved.palette, currentTheme);
        if (saved.radius !== 'md') applyRadius(saved.radius);
        if (saved.accent !== 'default') applyAccent(saved.accent, currentTheme);
      });
    }
  }

  return (
    <ThemeProvider theme={currentTheme}>
      <RouterView router={router} fallback={() => <div>Page not found</div>} />
    </ThemeProvider>
  );
}
