import { defineRoutes, createRouter } from '@vertz/ui/router';

const routes = defineRoutes({
  '/': {
    component: () => import('./pages/dashboard'),
  },
  '/workflows/:id': {
    component: () => import('./pages/workflow-detail'),
  },
  '/agents': {
    component: () => import('./pages/agents'),
  },
});

export const appRouter = createRouter(routes);
