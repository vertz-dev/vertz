import { getInjectedCSS, ThemeProvider } from '@vertz/ui';
import { createRouter, defineRoutes, RouterView } from '@vertz/ui/router';
import { ComponentPage } from './pages/component-page';
import { appGlobals } from './styles/globals';
import { docsTheme, themeGlobals } from './styles/theme';

// ── SSR module exports ─────────────────────────────────────
export { getInjectedCSS };
export const theme = docsTheme;
export const styles = [themeGlobals.css, appGlobals.css];

// ── Routes ─────────────────────────────────────────────────
const routes = defineRoutes({
  '/': {
    component: () => <ComponentPage />,
  },
  '/components/:name': {
    component: () => <ComponentPage />,
  },
});

const router = createRouter(routes);

// ── App component ──────────────────────────────────────────
export function App() {
  return (
    <ThemeProvider theme="dark">
      <RouterView router={router} fallback={() => <ComponentPage />} />
    </ThemeProvider>
  );
}
