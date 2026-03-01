/**
 * App router configuration.
 *
 * Demonstrates:
 * - defineRoutes() for route definition with loaders
 * - createRouter() for navigation state
 * - createLink() for client-side navigation with active state
 * - Outlet for nested route rendering
 * - Pages access navigation via useAppRouter() context (no prop threading)
 */

import type { InferRouteMap } from '@vertz/ui';
import {
  Outlet,
  OutletContext,
  computed,
  createLink,
  createRouter,
  defineRoutes,
  useRouter,
} from '@vertz/ui';
import { api } from './api/mock-data';
import { CreateTaskPage } from './pages/create-task';
import { SettingsPage } from './pages/settings';
import { TaskDetailPage } from './pages/task-detail';
import { TaskListPage } from './pages/task-list';

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
 * Create the router instance with routes and initial URL.
 *
 * The router provides reactive signals for the current route,
 * loader data, and navigation methods.
 *
 * SSR-compatible: Falls back to __SSR_URL__ or '/' when window is not available.
 */
const initialPath =
  typeof window !== 'undefined' && window.location
    ? window.location.pathname
    : (globalThis as any).__SSR_URL__ || '/';

export const appRouter = createRouter(routes, initialPath, { serverNav: true });

/**
 * Typed useRouter hook for the app's route map.
 *
 * Use this instead of plain useRouter() to get typed navigate() that
 * validates paths at compile time.
 */
export function useAppRouter() {
  return useRouter<InferRouteMap<typeof routes>>();
}

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
  return match ? window.location.pathname : initialPath;
});

export const Link = createLink(currentPath, (url: string) => {
  appRouter.navigate(url as Parameters<typeof appRouter.navigate>[0]);
});

/**
 * Re-export Outlet for convenience.
 *
 * The shared OutletContext is populated by RouterView when rendering
 * nested routes. Layouts call Outlet() to render their child route.
 */
export { Outlet, OutletContext };
