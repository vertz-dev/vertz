/**
 * Router configuration for the Linear clone.
 *
 * Routes:
 * - /login — public, renders LoginPage
 * - / — protected via ProtectedRoute, renders workspace shell with Outlet
 *   - /projects — project list
 *   - /projects/:projectId — project layout with nested routes
 */

import { createRouter, defineRoutes, onMount, useRouter } from '@vertz/ui';
import { ProtectedRoute } from '@vertz/ui-auth';
import { WorkspaceShell } from './components/auth-guard';
import { ProjectLayout } from './components/project-layout';
import { IssueListPage } from './pages/issue-list-page';
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
    component: () => <LoginPage />,
  },
  '/': {
    component: () => (
      <ProtectedRoute
        loginPath="/login"
        fallback={() => <div>Loading...</div>}
        children={() => <WorkspaceShell />}
      />
    ),
    children: {
      '/': {
        component: () => <IndexRedirect />,
      },
      '/projects': {
        component: () => <ProjectsPage />,
      },
      '/projects/:projectId': {
        component: () => ProjectLayout(),
        children: {
          '/': {
            component: () => IssueListPage(),
          },
          '/issues/:issueId': {
            component: () => <div>Issue detail — coming in Phase 3</div>,
          },
        },
      },
    },
  },
});

export const appRouter = createRouter(routes, { serverNav: true });
