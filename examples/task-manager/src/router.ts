/**
 * App router configuration.
 *
 * Demonstrates:
 * - defineRoutes() for route definition with loaders
 * - createRouter() for navigation state
 * - createLink() for client-side navigation
 * - createOutlet() for nested route rendering
 * - Route params extraction (task ID)
 */

import type { OutletContext, Router } from '@vertz/ui';
import {
  createContext,
  createLink,
  createOutlet,
  createRouter,
  defineRoutes,
  signal,
} from '@vertz/ui';
import { fetchTask, fetchTasks } from './api/mock-data';
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
 */
export const routes = defineRoutes({
  '/': {
    component: () => {
      // Create the page with navigation bound to the router
      return TaskListPage({
        navigate: (url: string) => appRouter.navigate(url),
      });
    },
    loader: async () => {
      const result = await fetchTasks();
      return result;
    },
  },

  '/tasks/new': {
    component: () => {
      return CreateTaskPage({
        navigate: (url: string) => appRouter.navigate(url),
      });
    },
  },

  '/tasks/:id': {
    component: () => {
      // Extract the task ID from the current route params
      const match = appRouter.current.value;
      const taskId = match?.params.id ?? '';
      return TaskDetailPage({
        taskId,
        navigate: (url: string) => appRouter.navigate(url),
      });
    },
    loader: async (ctx) => {
      const task = await fetchTask(ctx.params.id);
      return task;
    },
  },

  '/settings': {
    component: () => {
      return SettingsPage({
        navigate: (url: string) => appRouter.navigate(url),
      });
    },
  },
});

/**
 * Create the router instance with routes and initial URL.
 *
 * The router provides reactive signals for the current route,
 * loader data, and navigation methods.
 * 
 * In browser context, use window.location.pathname.
 * In SSR context (no window), fall back to __SSR_URL__ or '/'.
 */
const initialUrl = 
  typeof window !== 'undefined' 
    ? window.location.pathname
    : (globalThis as any).__SSR_URL__ || '/';

export const appRouter: Router = createRouter(routes, initialUrl);

/**
 * Create the Link component factory, bound to the router's current path.
 *
 * The Link component creates <a> elements that:
 * - Intercept clicks for SPA navigation
 * - Apply an activeClass when the href matches the current path
 */
const currentPath = signal(initialUrl);

// Keep currentPath in sync with the router
// (In a real app, the router would expose a path signal directly)
export const Link = createLink(currentPath, (url: string) => {
  appRouter.navigate(url);
  currentPath.value = url;
});

/**
 * Create an Outlet context and component for nested route rendering.
 *
 * This is set up even though we're using flat routes in this demo,
 * to demonstrate the API for layout patterns.
 */
export const outletContext = createContext<OutletContext>({
  childComponent: undefined,
  depth: 0,
});

export const Outlet = createOutlet(outletContext);
