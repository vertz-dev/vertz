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
import { IssueDetailPage } from './pages/issue-detail-page';
import { IssueListPage } from './pages/issue-list-page';
import { LoginPage } from './pages/login-page';
import { ProjectBoardPage } from './pages/project-board-page';
import { ProjectsPage } from './pages/projects-page';

/** Redirect `/` → `/projects` so the layout route always has a matched child. */
function IndexRedirect() {
  const { navigate } = useRouter();

  onMount(() => {
    // '/projects' is a nested child route under '/', which the typed router
    // doesn't include in RoutePattern. Cast to satisfy the type system.
    navigate({ to: '/projects' as '/' });
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
        component: () => <ProjectLayout />,
        children: {
          '/': {
            component: () => <IssueListPage />,
          },
          '/board': {
            component: () => <ProjectBoardPage />,
          },
          '/issues/:issueId': {
            component: () => <IssueDetailPage />,
          },
        },
      },
    },
  },
});

export const appRouter = createRouter(routes, { serverNav: true });
