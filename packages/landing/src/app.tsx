import { getInjectedCSS, ThemeProvider } from '@vertz/ui';
import { createRouter, defineRoutes, RouterView } from '@vertz/ui/router';
import { HomePage } from './pages/home';
import ManifestoPage from './pages/manifesto';
import { OpenAPIPage } from './pages/openapi';
import { appGlobals } from './styles/globals';
import { landingTheme, themeGlobals } from './styles/theme';

// ── SSR module exports ─────────────────────────────────────
export { getInjectedCSS };
export const theme = landingTheme;
export const styles = [themeGlobals.css, appGlobals.css];

// ── Routes ─────────────────────────────────────────────────
const routes = defineRoutes({
  '/': { component: () => HomePage() },
  '/manifesto': { component: () => ManifestoPage() },
  '/openapi': { component: () => OpenAPIPage() },
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
