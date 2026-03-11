import { getInjectedCSS, ThemeProvider } from '@vertz/ui';
import { createRouter, defineRoutes, RouterView } from '@vertz/ui/router';
import { HomePage } from './pages/home';
import { appGlobals } from './styles/globals';
import { landingTheme, themeGlobals } from './styles/theme';

// ── SSR module exports ─────────────────────────────────────
export { getInjectedCSS };
export const theme = landingTheme;
export const styles = [themeGlobals.css, appGlobals.css];

// ── Routes ─────────────────────────────────────────────────
const routes = defineRoutes({
  '/': { component: () => <HomePage /> },
  '/manifesto': { component: () => import('./pages/manifesto') },
});

const router = createRouter(routes);

// ── App component ──────────────────────────────────────────
export function App() {
  return (
    <ThemeProvider theme="dark">
      <RouterView router={router} fallback={() => <HomePage />} />
    </ThemeProvider>
  );
}
