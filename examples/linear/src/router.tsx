/**
 * Router configuration for the Linear clone.
 *
 * Two top-level routes:
 * - /login — public, renders LoginPage
 * - / — protected via ProtectedRoute, renders workspace shell with Outlet
 */

import { createRouter, defineRoutes, onMount, useRouter } from '@vertz/ui';
import { ProtectedRoute } from '@vertz/ui/auth';
import { WorkspaceShell } from './components/auth-guard';
import { LoginPage } from './pages/login-page';
import { ProjectsPage } from './pages/projects-page';

/** Redirect `/` → `/projects` so the layout route always has a matched child. */
function IndexRedirect() {
  const { navigate } = useRouter();

  onMount(() => {
    navigate({ to: '/projects' });
  });

  return <div />;
}

export const routes = defineRoutes({
  '/login': {
    component: () => LoginPage(),
  },
  '/': {
    component: () =>
      ProtectedRoute({
        loginPath: '/login',
        fallback: () => <div>Loading...</div>,
        children: () => <WorkspaceShell />,
      }),
    children: {
      '/': {
        component: () => IndexRedirect(),
      },
      '/projects': {
        component: () => ProjectsPage(),
      },
    },
  },
});

const initialPath =
  typeof window !== 'undefined' && window.location
    ? window.location.pathname
    : ((globalThis as Record<string, unknown>).__SSR_URL__ as string) || '/';

export const appRouter = createRouter(routes, initialPath, { serverNav: true });
