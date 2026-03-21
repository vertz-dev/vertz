/**
 * Router configuration for the Linear clone.
 *
 * Routes:
 * - /login — public, renders LoginPage
 * - / — protected via ProtectedRoute, renders workspace shell with Outlet
 *   - /projects — project list
 *   - /projects/:projectId — project layout with nested routes
 *
 * All data-fetching routes are wrapped in ErrorBoundary for graceful error
 * recovery with retry.
 */

import { createRouter, defineRoutes, onMount, useRouter } from '@vertz/ui';
import { ProtectedRoute } from '@vertz/ui-auth';
import { WorkspaceShell } from './components/auth-guard';
import { AuthLoadingSkeleton } from './components/loading-skeleton';
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
        fallback={() => <AuthLoadingSkeleton />}
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
