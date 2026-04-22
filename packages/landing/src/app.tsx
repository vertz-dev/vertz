import { getInjectedCSS, ThemeProvider } from '@vertz/ui';
import { createRouter, defineRoutes, RouterView } from '@vertz/ui/router';
import { BlogListPage } from './pages/blog/index';
import { BlogPostPage } from './pages/blog/post';
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
// Exported so `vertz build`'s pre-render pipeline can enumerate them
// via `collectPrerenderPaths(ssrModule.routes)` as a deterministic
// fallback when runtime route discovery (render '/') fails.
export const routes = defineRoutes({
  '/': { component: () => <HomePage /> },
  '/manifesto': { component: () => <ManifestoPage /> },
  '/openapi': { component: () => <OpenAPIPage /> },
  '/blog': { component: () => <BlogListPage /> },
  '/blog/:slug': { component: () => <BlogPostPage /> },
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
