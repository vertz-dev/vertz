/**
 * App router configuration.
 *
 * Demonstrates:
 * - defineRoutes() for route definition with loaders
 * - createRouter() for navigation state
 * - createLink() for client-side navigation with active state
 * - Outlet for nested route rendering
 * - Pages access navigation via useRouter() context (no prop threading)
 */

import { computed, createLink, createRouter, defineRoutes, Outlet, OutletContext } from '@vertz/ui';
import type { SearchParamSchema } from '@vertz/ui';
import { api } from './api/mock-data';
import { CreateTaskPage } from './pages/create-task';
import { SettingsPage } from './pages/settings';
import { TaskDetailPage } from './pages/task-detail';
import { TaskListPage } from './pages/task-list';

/** Search params schema for the task list page — provides defaults. */
const taskListSearchParams: SearchParamSchema<{ page: number }> = {
  parse(data: unknown) {
    const raw = data as Record<string, string>;
    const page = Number(raw.page) || 1;
    return { ok: true as const, data: { page } };
  },
};

/**
 * Define the app routes.
 *
 * Each route has:
 * - component: a factory function returning the page element
 * - loader (optional): async data fetching that runs before render
 *
 * Pages access navigation and route params via useRouter() context,
 * so no manual prop threading is needed here.
 */
export const routes = defineRoutes({
  '/': {
    component: () => TaskListPage(),
    searchParams: taskListSearchParams,
    loader: async () => {
      return await api.tasks.list();
    },
  },

  '/tasks/new': {
    component: () => CreateTaskPage(),
  },

  '/tasks/:id': {
    component: () => TaskDetailPage(),
    loader: async (ctx) => {
      return await api.tasks.get(ctx.params.id);
    },
  },

  '/settings': {
    component: () => SettingsPage(),
  },
});

/**
 * Create the router instance with routes.
 *
 * The router provides reactive signals for the current route,
 * loader data, and navigation methods.
 *
 * createRouter auto-detects the initial URL from window.location (browser)
 * or SSR context — no manual detection needed.
 */
export const appRouter = createRouter(routes, { serverNav: true, viewTransition: true });

/**
 * Create the Link component factory, bound to the router's current path.
 *
 * The Link component creates <a> elements that:
 * - Intercept clicks for SPA navigation
 * - Apply an activeClass when the href matches the current path
 *
 * currentPath is derived reactively from router.current.
 */
const currentPath = computed(() => {
  const match = appRouter.current.value;
  return match ? window.location.pathname : '/';
});

export const Link = createLink(currentPath, (url: string) => {
  appRouter.navigate({ to: url as Parameters<typeof appRouter.navigate>[0]['to'] });
});

/**
 * Re-export Outlet for convenience.
 *
 * The shared OutletContext is populated by RouterView when rendering
 * nested routes. Layouts call Outlet() to render their child route.
 */
export { Outlet, OutletContext };
